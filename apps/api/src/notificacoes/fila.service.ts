import { Inject, Injectable, Logger } from '@nestjs/common';
import { Dispositivo, Enviador, Relogio } from './enviador';
import {
  Decisao,
  Enfileiramento,
  FilaDoUsuario,
  FilaRepositorio,
} from './fila.repositorio';
import { fimDoSilencio, inicioDoDia } from './horario';
import { linkDoEvento, textoDoAviso, textoSeguro, TIPOS_AVISO } from './regras';

export interface ConfigFila {
  /** Releitura antes do cursor, em minutos. */
  margemMinutos: number;
  /** Idade máxima do fato na publicação, em dias. */
  frescorDias: number;
  /** Usuários por consulta da fila. */
  lote: number;
  /** Tentativas de envio antes de desistir. */
  maxTentativas: number;
}

export const CONFIG_FILA_PADRAO: ConfigFila = {
  margemMinutos: 120,
  frescorDias: 7,
  lote: 200,
  maxTentativas: 5,
};

export const CONFIG_FILA = Symbol('CONFIG_FILA');

export interface ResultadoEnvio {
  usuarios: number;
  /** Usuários que outro notificador estava processando. */
  ocupados: number;
  enviadas: number;
  /** Aparelhos alcançados (um aviso pode chegar a mais de um). */
  entregas: number;
  silencio: number;
  resumo: number;
  descartadas: Record<string, number>;
  reagendadas: number;
  falhas: number;
  tokensRemovidos: number;
}

export interface ResultadoCiclo {
  enfileiramento: Enfileiramento;
  envio: ResultadoEnvio;
}

function vazio(): ResultadoEnvio {
  return {
    usuarios: 0,
    ocupados: 0,
    enviadas: 0,
    entregas: 0,
    silencio: 0,
    resumo: 0,
    descartadas: {},
    reagendadas: 0,
    falhas: 0,
    tokensRemovidos: 0,
  };
}

/**
 * Fila de avisos: enfileira os eventos recém-publicados para quem segue algum
 * alvo deles e envia respeitando as preferências de cada conta.
 *
 * - avisos desligados: nada é enviado;
 * - horário de silêncio (no fuso da conta): o aviso espera o fim do silêncio;
 * - teto diário: o que passa do teto não é enviado e entra no resumo semanal;
 * - aparelho: só os das sessões ativas; token inválido é apagado;
 * - falha passageira do envio: nova tentativa com espera crescente.
 */
@Injectable()
export class FilaService {
  private readonly log = new Logger('Fila');

  constructor(
    @Inject(FilaRepositorio) private readonly fila: FilaRepositorio,
    @Inject(Enviador) private readonly enviador: Enviador,
    @Inject(Relogio) private readonly relogio: Relogio,
    @Inject(CONFIG_FILA) private readonly config: ConfigFila,
  ) {}

  enfileirar(): Promise<Enfileiramento> {
    return this.fila.enfileirar({
      ate: this.relogio.agora(),
      margemMs: this.config.margemMinutos * 60_000,
      tipos: TIPOS_AVISO,
      frescorDias: this.config.frescorDias,
    });
  }

  async enviar(): Promise<ResultadoEnvio> {
    const resultado = vazio();
    const vistos: string[] = [];
    for (;;) {
      const usuarios = await this.fila.usuariosComPendentes(
        this.relogio.agora(),
        this.config.lote,
        vistos,
      );
      if (usuarios.length === 0) break;
      for (const usuarioId of usuarios) {
        vistos.push(usuarioId);
        const feito = await this.fila.comUsuario(usuarioId, (fila) =>
          this.processar(fila, resultado),
        );
        if (feito === null) resultado.ocupados += 1;
        else resultado.usuarios += 1;
      }
    }
    return resultado;
  }

  async ciclo(): Promise<ResultadoCiclo> {
    const enfileiramento = await this.enfileirar();
    const envio = await this.enviar();
    this.log.log({
      msg: 'ciclo da fila',
      enviador: this.enviador.nome,
      ...enfileiramento,
      ...envio,
    });
    return { enfileiramento, envio };
  }

  private async processar(
    fila: FilaDoUsuario,
    total: ResultadoEnvio,
  ): Promise<true> {
    const agora = this.relogio.agora();
    const pendentes = await fila.pendentes(agora);
    if (pendentes.length === 0) return true;
    const prefs = await fila.preferencias();
    const decisoes: Decisao[] = [];
    const descartar = (
      id: string,
      motivo: Extract<Decisao, { status: 'descartada' }>['motivo'],
    ) => {
      decisoes.push({ id, status: 'descartada', motivo });
      total.descartadas[motivo] = (total.descartadas[motivo] ?? 0) + 1;
    };

    const validos = pendentes.filter((p) => {
      if (!prefs.notificacoes) descartar(p.id, 'desligada');
      else if (!p.publicado) descartar(p.id, 'despublicado');
      else if (!p.segue) descartar(p.id, 'nao_segue');
      else return true;
      return false;
    });

    const fimSilencio = validos.length > 0 ? fimDoSilencio(prefs, agora) : null;
    if (fimSilencio) {
      for (const p of validos) {
        decisoes.push({
          id: p.id,
          status: 'pendente',
          motivo: 'silencio',
          enviarApos: fimSilencio,
          tentativas: p.tentativas,
        });
      }
      total.silencio += validos.length;
      await fila.registrar(decisoes);
      return true;
    }

    let dispositivos: Dispositivo[] =
      validos.length > 0 ? await fila.dispositivos() : [];
    let vagas =
      validos.length > 0
        ? prefs.maxPorDia -
          (await fila.enviadasDesde(inicioDoDia(agora, prefs.fuso)))
        : 0;

    for (const p of validos) {
      if (vagas <= 0) {
        decisoes.push({ id: p.id, status: 'resumo', motivo: 'teto' });
        total.resumo += 1;
        continue;
      }
      if (dispositivos.length === 0) {
        descartar(p.id, 'sem_dispositivo');
        continue;
      }
      const texto = textoDoAviso(p);
      if (!textoSeguro(texto)) {
        descartar(p.id, 'texto');
        continue;
      }
      const mensagem = {
        ...texto,
        dados: { url: linkDoEvento(p.eventoId), eventoId: p.eventoId },
      };
      let entregues = 0;
      let temporario = false;
      for (const d of dispositivos) {
        const r = await this.enviador.enviar(mensagem, d);
        if (r === 'ok') entregues += 1;
        else if (r === 'temporario') temporario = true;
        else if (r === 'token_invalido') {
          await fila.removerDispositivo(d.token);
          dispositivos = dispositivos.filter((x) => x.token !== d.token);
          total.tokensRemovidos += 1;
        }
      }
      if (entregues > 0) {
        decisoes.push({
          id: p.id,
          status: 'enviada',
          ...texto,
          dispositivos: entregues,
          em: agora,
        });
        vagas -= 1;
        total.enviadas += 1;
        total.entregas += entregues;
      } else if (temporario && p.tentativas + 1 < this.config.maxTentativas) {
        decisoes.push({
          id: p.id,
          status: 'pendente',
          motivo: 'erro_envio',
          // 1, 2, 4, 8... minutos
          enviarApos: new Date(agora.getTime() + 60_000 * 2 ** p.tentativas),
          tentativas: p.tentativas + 1,
        });
        total.reagendadas += 1;
      } else if (temporario || dispositivos.length > 0) {
        decisoes.push({ id: p.id, status: 'falhou', motivo: 'erro_envio' });
        total.falhas += 1;
      } else {
        descartar(p.id, 'sem_dispositivo');
      }
    }
    await fila.registrar(decisoes);
    return true;
  }
}
