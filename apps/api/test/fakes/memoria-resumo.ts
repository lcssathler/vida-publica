import { horaLocal } from '../../src/notificacoes/horario';
import { TotalPorTipo } from '../../src/notificacoes/resumo';
import {
  DecisaoResumo,
  NovoResumo,
  ResumoDevido,
  ResumoDoUsuario,
  ResumoPendente,
  ResumoRepositorio,
} from '../../src/notificacoes/resumo.repositorio';
import { MemoriaFila } from './memoria-fila';

export interface ResumoGravado {
  usuarioId: string;
  semana: string;
  status: string;
  motivo: string | null;
  conteudo: NovoResumo['conteudo'];
  titulo: string | null;
  corpo: string | null;
  url: string | null;
  enviarApos: Date;
  tentativas: number;
  enviadoEm: Date | null;
  dispositivos: number | null;
}

function iso(ano: number, mes: number, dia: number): string {
  return new Date(Date.UTC(ano, mes - 1, dia)).toISOString().slice(0, 10);
}

/** Resumos em memória, sobre os eventos, seguidos e aparelhos da MemoriaFila. */
export class MemoriaResumo extends ResumoRepositorio {
  readonly resumos: ResumoGravado[] = [];
  readonly travados = new Set<string>();

  constructor(private readonly fila: MemoriaFila) {
    super();
  }

  devidos(
    agora: Date,
    horaMinutos: number,
    limite: number,
    excluir: readonly string[],
  ): Promise<ResumoDevido[]> {
    const devidos: ResumoDevido[] = [];
    for (const usuarioId of [...this.fila.seguindo.keys()].sort()) {
      if (excluir.includes(usuarioId)) continue;
      const { fuso } = this.fila.prefsDe(usuarioId);
      const l = horaLocal(agora, fuso);
      const diaDaSemana =
        new Date(Date.UTC(l.ano, l.mes - 1, l.dia)).getUTCDay() || 7;
      const segunda = l.dia - (diaDaSemana - 1);
      if (diaDaSemana === 1 && l.minutos < horaMinutos) continue;
      const semana = iso(l.ano, l.mes, segunda - 7);
      if (this.de(usuarioId, semana)) continue;
      devidos.push({ usuarioId, semana, fuso });
    }
    return Promise.resolve(devidos.slice(0, limite));
  }

  usuariosComPendentes(
    agora: Date,
    limite: number,
    excluir: readonly string[],
  ): Promise<string[]> {
    const usuarios = new Set(
      this.resumos
        .filter(
          (r) =>
            r.status === 'pendente' &&
            r.enviarApos <= agora &&
            !excluir.includes(r.usuarioId),
        )
        .map((r) => r.usuarioId),
    );
    return Promise.resolve([...usuarios].slice(0, limite));
  }

  async comUsuario<T>(
    usuarioId: string,
    fn: (resumo: ResumoDoUsuario) => Promise<T>,
  ): Promise<T | null> {
    if (this.travados.has(usuarioId)) return null;
    return fn(this.doUsuario(usuarioId));
  }

  de(usuarioId: string, semana: string): ResumoGravado | undefined {
    return this.resumos.find(
      (r) => r.usuarioId === usuarioId && r.semana === semana,
    );
  }

  private doUsuario(usuarioId: string): ResumoDoUsuario {
    const fila = this.fila;
    return {
      preferencias: () => Promise.resolve(fila.prefsDe(usuarioId)),
      totais: (desde: Date, ate: Date, tipos: readonly string[]) => {
        const alvos = fila.seguindo.get(usuarioId) ?? new Map<string, Date>();
        const porTipo = new Map<string, TotalPorTipo>();
        for (const e of fila.eventos) {
          if (e.status !== 'publicado' || !e.fonteUrl || !e.publicadoEm)
            continue;
          if (!tipos.includes(e.tipo)) continue;
          if (e.publicadoEm < desde || e.publicadoEm >= ate) continue;
          if (!fila.iniciadoEm || e.publicadoEm <= fila.iniciadoEm) continue;
          const seguia = e.alvos.some((a) => {
            const quando = alvos.get(a);
            return quando !== undefined && quando <= e.publicadoEm!;
          });
          if (!seguia) continue;
          const t = porTipo.get(e.tipo) ?? {
            tipo: e.tipo,
            registros: 0,
            valor: null,
          };
          t.registros += 1;
          if (e.valor != null) t.valor = (t.valor ?? 0) + e.valor;
          porTipo.set(e.tipo, t);
        }
        return Promise.resolve([...porTipo.values()]);
      },
      excedentes: (desde: Date, ate: Date) =>
        Promise.resolve(
          fila
            .doUsuario(usuarioId)
            .filter(
              (n) =>
                n.status === 'resumo' &&
                n.motivo === 'teto' &&
                n.criadaEm >= desde &&
                n.criadaEm < ate,
            ).length,
        ),
      criar: (semana: string, novo: NovoResumo) => {
        if (this.de(usuarioId, semana)) return Promise.resolve(false);
        const pendente = novo.status === 'pendente' ? novo : null;
        this.resumos.push({
          usuarioId,
          semana,
          status: novo.status,
          motivo:
            novo.status === 'descartado'
              ? novo.motivo
              : (pendente?.motivo ?? null),
          conteudo: novo.conteudo,
          titulo: pendente?.titulo ?? null,
          corpo: pendente?.corpo ?? null,
          url: pendente?.url ?? null,
          enviarApos: pendente?.enviarApos ?? new Date(0),
          tentativas: 0,
          enviadoEm: null,
          dispositivos: null,
        });
        return Promise.resolve(true);
      },
      pendentes: (agora: Date): Promise<ResumoPendente[]> =>
        Promise.resolve(
          this.resumos
            .filter(
              (r) =>
                r.usuarioId === usuarioId &&
                r.status === 'pendente' &&
                r.enviarApos <= agora,
            )
            .map((r) => ({
              semana: r.semana,
              titulo: r.titulo!,
              corpo: r.corpo!,
              url: r.url!,
              tentativas: r.tentativas,
            })),
        ),
      dispositivos: () =>
        Promise.resolve([...(fila.dispositivos.get(usuarioId) ?? [])]),
      registrar: (semana: string, d: DecisaoResumo) => {
        const r = this.de(usuarioId, semana)!;
        r.status = d.status;
        if (d.status === 'enviado') {
          r.motivo = null;
          r.enviadoEm = d.em;
          r.dispositivos = d.dispositivos;
          r.tentativas += 1;
        } else if (d.status === 'pendente') {
          r.motivo = d.motivo;
          r.enviarApos = d.enviarApos;
          r.tentativas = d.tentativas;
        } else {
          r.motivo = d.motivo;
        }
        return Promise.resolve();
      },
      removerDispositivo: (token: string) => {
        for (const [u, lista] of fila.dispositivos) {
          fila.dispositivos.set(
            u,
            lista.filter((d) => d.token !== token),
          );
        }
        return Promise.resolve();
      },
    };
  }
}
