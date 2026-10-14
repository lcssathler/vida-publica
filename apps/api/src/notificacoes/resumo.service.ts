import { Inject, Injectable, Logger } from '@nestjs/common';
import { Dispositivo, Enviador, Relogio } from './enviador';
import { CONFIG_FILA, type ConfigFila } from './fila.service';
import { fimDoSilencio, instanteLocal, paraMinutos } from './horario';
import { textoSeguro, TIPOS_RESUMO } from './regras';
import {
  DecisaoResumo,
  ResumoDoUsuario,
  ResumoRepositorio,
} from './resumo.repositorio';
import { textoDoResumo } from './resumo';

export interface ConfigResumo {
  /** Hora local ("HH:MM") de segunda-feira em que sai o resumo da semana anterior. */
  hora: string;
}

export const CONFIG_RESUMO = Symbol('CONFIG_RESUMO');

export interface ResultadoResumo {
  /** Resumos gravados nesta rodada, por status. */
  gerados: Record<string, number>;
  enviados: number;
  entregas: number;
  silencio: number;
  descartados: Record<string, number>;
  reagendados: number;
  falhas: number;
  tokensRemovidos: number;
  ocupados: number;
}

/** Janela da semana: de segunda 00:00 a segunda seguinte 00:00, no fuso. */
export function janelaDaSemana(
  semana: string,
  fuso: string,
): { desde: Date; ate: Date } {
  const [a, m, d] = semana.split('-').map(Number);
  return {
    desde: instanteLocal(a, m, d, 0, fuso),
    ate: instanteLocal(a, m, d + 7, 0, fuso),
  };
}

/**
 * Resumo semanal: na segunda-feira, a partir da hora configurada (no fuso de
 * cada conta), um aviso com o dinheiro e as despesas de quem a pessoa segue
 * publicados na semana anterior e quantos avisos passaram do teto diário.
 * Respeita "resumo semanal" e "avisos" das preferências e o horário de
 * silêncio (espera o fim); não conta no teto diário. Um por usuário e semana.
 */
@Injectable()
export class ResumoService {
  private readonly log = new Logger('Resumo');

  constructor(
    @Inject(ResumoRepositorio) private readonly repo: ResumoRepositorio,
    @Inject(Enviador) private readonly enviador: Enviador,
    @Inject(Relogio) private readonly relogio: Relogio,
    @Inject(CONFIG_FILA) private readonly fila: ConfigFila,
    @Inject(CONFIG_RESUMO) private readonly config: ConfigResumo,
  ) {}

  async ciclo(): Promise<ResultadoResumo> {
    const r: ResultadoResumo = {
      gerados: {},
      enviados: 0,
      entregas: 0,
      silencio: 0,
      descartados: {},
      reagendados: 0,
      falhas: 0,
      tokensRemovidos: 0,
      ocupados: 0,
    };
    await this.gerar(r);
    await this.enviar(r);
    this.log.log({
      msg: 'ciclo do resumo semanal',
      enviador: this.enviador.nome,
      ...r,
    });
    return r;
  }

  private async gerar(r: ResultadoResumo): Promise<void> {
    const vistos: string[] = [];
    for (;;) {
      const devidos = await this.repo.devidos(
        this.relogio.agora(),
        paraMinutos(this.config.hora),
        this.fila.lote,
        vistos,
      );
      if (devidos.length === 0) break;
      for (const devido of devidos) {
        vistos.push(devido.usuarioId);
        const status = await this.repo.comUsuario(devido.usuarioId, (u) =>
          this.gerarDe(u, devido.semana),
        );
        if (status === null) r.ocupados += 1;
        else if (status) r.gerados[status] = (r.gerados[status] ?? 0) + 1;
      }
    }
  }

  private async gerarDe(
    u: ResumoDoUsuario,
    semana: string,
  ): Promise<string | undefined> {
    const prefs = await u.preferencias();
    const vazio = { totais: [], excedentes: 0 };
    if (!prefs.notificacoes || !prefs.resumoSemanal) {
      const criado = await u.criar(semana, {
        status: 'descartado',
        motivo: 'desligado',
        conteudo: vazio,
      });
      return criado ? 'descartado' : undefined;
    }
    const { desde, ate } = janelaDaSemana(semana, prefs.fuso);
    const conteudo = {
      totais: await u.totais(desde, ate, TIPOS_RESUMO),
      excedentes: await u.excedentes(desde, ate),
    };
    const texto = textoDoResumo(semana, conteudo);
    if (!texto) {
      return (await u.criar(semana, { status: 'vazio', conteudo }))
        ? 'vazio'
        : undefined;
    }
    const agora = this.relogio.agora();
    const fim = fimDoSilencio(prefs, agora);
    const criado = await u.criar(semana, {
      status: 'pendente',
      conteudo,
      ...texto,
      enviarApos: fim ?? agora,
      motivo: fim ? 'silencio' : null,
    });
    return criado ? 'pendente' : undefined;
  }

  private async enviar(r: ResultadoResumo): Promise<void> {
    const vistos: string[] = [];
    for (;;) {
      const usuarios = await this.repo.usuariosComPendentes(
        this.relogio.agora(),
        this.fila.lote,
        vistos,
      );
      if (usuarios.length === 0) break;
      for (const usuarioId of usuarios) {
        vistos.push(usuarioId);
        const feito = await this.repo.comUsuario(usuarioId, (u) =>
          this.enviarDe(u, r),
        );
        if (feito === null) r.ocupados += 1;
      }
    }
  }

  private async enviarDe(u: ResumoDoUsuario, r: ResultadoResumo) {
    const agora = this.relogio.agora();
    const pendentes = await u.pendentes(agora);
    if (pendentes.length === 0) return true;
    const prefs = await u.preferencias();
    const descartar = async (
      semana: string,
      motivo: Extract<DecisaoResumo, { status: 'descartado' }>['motivo'],
    ) => {
      await u.registrar(semana, { status: 'descartado', motivo });
      r.descartados[motivo] = (r.descartados[motivo] ?? 0) + 1;
    };
    let dispositivos: Dispositivo[] | null = null;
    for (const p of pendentes) {
      if (!prefs.notificacoes || !prefs.resumoSemanal) {
        await descartar(p.semana, 'desligado');
        continue;
      }
      const fim = fimDoSilencio(prefs, agora);
      if (fim) {
        await u.registrar(p.semana, {
          status: 'pendente',
          motivo: 'silencio',
          enviarApos: fim,
          tentativas: p.tentativas,
        });
        r.silencio += 1;
        continue;
      }
      if (!textoSeguro(p)) {
        await descartar(p.semana, 'texto');
        continue;
      }
      dispositivos ??= await u.dispositivos();
      if (dispositivos.length === 0) {
        await descartar(p.semana, 'sem_dispositivo');
        continue;
      }
      const mensagem = {
        titulo: p.titulo,
        corpo: p.corpo,
        dados: { url: p.url },
      };
      let entregues = 0;
      let temporario = false;
      for (const d of dispositivos) {
        const resultado = await this.enviador.enviar(mensagem, d);
        if (resultado === 'ok') entregues += 1;
        else if (resultado === 'temporario') temporario = true;
        else if (resultado === 'token_invalido') {
          await u.removerDispositivo(d.token);
          dispositivos = dispositivos.filter((x) => x.token !== d.token);
          r.tokensRemovidos += 1;
        }
      }
      if (entregues > 0) {
        await u.registrar(p.semana, {
          status: 'enviado',
          dispositivos: entregues,
          em: agora,
        });
        r.enviados += 1;
        r.entregas += entregues;
      } else if (temporario && p.tentativas + 1 < this.fila.maxTentativas) {
        await u.registrar(p.semana, {
          status: 'pendente',
          motivo: 'erro_envio',
          enviarApos: new Date(agora.getTime() + 60_000 * 2 ** p.tentativas),
          tentativas: p.tentativas + 1,
        });
        r.reagendados += 1;
      } else if (temporario || dispositivos.length > 0) {
        await u.registrar(p.semana, { status: 'falhou', motivo: 'erro_envio' });
        r.falhas += 1;
      } else {
        await descartar(p.semana, 'sem_dispositivo');
      }
    }
    return true;
  }
}
