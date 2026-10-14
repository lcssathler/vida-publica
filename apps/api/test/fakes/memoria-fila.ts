import { PREFERENCIAS_PADRAO } from '../../src/conta/conta.repositorio';
import { Dispositivo } from '../../src/notificacoes/enviador';
import {
  Decisao,
  Enfileiramento,
  FilaDoUsuario,
  FilaRepositorio,
  ParametrosEnfileirar,
  Pendente,
  PreferenciasAviso,
} from '../../src/notificacoes/fila.repositorio';

export interface EventoFila {
  id: string;
  tipo: string;
  titulo: string;
  resumo: string | null;
  status: 'publicado' | 'segurado' | 'arquivado';
  fonteUrl: string | null;
  ocorridoEm: Date;
  publicadoEm: Date | null;
  alvos: string[]; // "tipo:id"
  valor?: number | null;
}

export interface Aviso {
  id: string;
  usuarioId: string;
  eventoId: string;
  tipo: string;
  status: Decisao['status'];
  motivo: string | null;
  criadaEm: Date;
  enviarApos: Date;
  tentativas: number;
  enviadaEm: Date | null;
  titulo: string | null;
  corpo: string | null;
  dispositivos: number | null;
}

const DIA = 86_400_000;

/** Fila em memória com a mesma semântica do adaptador Postgres. */
export class MemoriaFila extends FilaRepositorio {
  readonly eventos: EventoFila[] = [];
  /** usuário → alvo ("tipo:id") → quando passou a seguir */
  readonly seguindo = new Map<string, Map<string, Date>>();
  readonly preferencias = new Map<string, Partial<PreferenciasAviso>>();
  readonly dispositivos = new Map<string, Dispositivo[]>();
  readonly avisos: Aviso[] = [];
  cursor: Date | null = null;
  iniciadoEm: Date | null = null;
  /** Usuários que "outro notificador" está processando. */
  readonly travados = new Set<string>();
  private proximo = 1;

  seguir(usuarioId: string, alvo: string, desde: Date): void {
    const mapa = this.seguindo.get(usuarioId) ?? new Map<string, Date>();
    mapa.set(alvo, desde);
    this.seguindo.set(usuarioId, mapa);
  }

  enfileirar(p: ParametrosEnfileirar): Promise<Enfileiramento> {
    if (!this.cursor || !this.iniciadoEm) {
      this.cursor = p.ate;
      this.iniciadoEm = p.ate;
      return Promise.resolve({
        inicial: true,
        enfileiradas: 0,
        desde: null,
        ate: p.ate,
      });
    }
    const desde = new Date(
      Math.max(this.cursor.getTime() - p.margemMs, this.iniciadoEm.getTime()),
    );
    let enfileiradas = 0;
    for (const e of this.eventos) {
      if (e.status !== 'publicado' || !e.fonteUrl || !e.publicadoEm) continue;
      if (e.publicadoEm <= desde || e.publicadoEm > p.ate) continue;
      if (!p.tipos.includes(e.tipo)) continue;
      if (
        e.ocorridoEm.getTime() <
        e.publicadoEm.getTime() - p.frescorDias * DIA
      )
        continue;
      if (e.ocorridoEm.getTime() > p.ate.getTime() + 2 * DIA) continue;
      for (const [usuarioId, alvos] of this.seguindo) {
        const seguia = e.alvos.some((a) => {
          const desdeQuando = alvos.get(a);
          return desdeQuando !== undefined && desdeQuando <= e.publicadoEm!;
        });
        if (!seguia) continue;
        if (this.preferencias.get(usuarioId)?.notificacoes === false) continue;
        if (
          this.avisos.some(
            (n) => n.usuarioId === usuarioId && n.eventoId === e.id,
          )
        ) {
          continue;
        }
        this.avisos.push({
          id: String(this.proximo++),
          usuarioId,
          eventoId: e.id,
          tipo: e.tipo,
          status: 'pendente',
          motivo: null,
          criadaEm: p.ate,
          enviarApos: p.ate,
          tentativas: 0,
          enviadaEm: null,
          titulo: null,
          corpo: null,
          dispositivos: null,
        });
        enfileiradas += 1;
      }
    }
    if (p.ate > this.cursor) this.cursor = p.ate;
    return Promise.resolve({ inicial: false, enfileiradas, desde, ate: p.ate });
  }

  usuariosComPendentes(
    agora: Date,
    limite: number,
    excluir: readonly string[],
  ): Promise<string[]> {
    const usuarios = new Set<string>();
    for (const n of this.avisos) {
      if (
        n.status === 'pendente' &&
        n.enviarApos <= agora &&
        !excluir.includes(n.usuarioId)
      ) {
        usuarios.add(n.usuarioId);
      }
    }
    return Promise.resolve([...usuarios].slice(0, limite));
  }

  async comUsuario<T>(
    usuarioId: string,
    fn: (fila: FilaDoUsuario) => Promise<T>,
  ): Promise<T | null> {
    if (this.travados.has(usuarioId)) return null;
    return fn(this.filaDe(usuarioId));
  }

  prefsDe(usuarioId: string): PreferenciasAviso {
    const p = { ...PREFERENCIAS_PADRAO, ...this.preferencias.get(usuarioId) };
    return {
      notificacoes: p.notificacoes,
      resumoSemanal: p.resumoSemanal,
      maxPorDia: p.maxPorDia,
      silencioInicio: p.silencioInicio,
      silencioFim: p.silencioFim,
      fuso: p.fuso,
    };
  }

  doUsuario(usuarioId: string): Aviso[] {
    return this.avisos.filter((n) => n.usuarioId === usuarioId);
  }

  private filaDe(usuarioId: string): FilaDoUsuario {
    const evento = (id: string) => this.eventos.find((e) => e.id === id)!;
    return {
      preferencias: () => Promise.resolve(this.prefsDe(usuarioId)),
      pendentes: (agora: Date): Promise<Pendente[]> =>
        Promise.resolve(
          this.doUsuario(usuarioId)
            .filter((n) => n.status === 'pendente' && n.enviarApos <= agora)
            .map((n) => {
              const e = evento(n.eventoId);
              const alvos =
                this.seguindo.get(usuarioId) ?? new Map<string, Date>();
              return {
                id: n.id,
                eventoId: n.eventoId,
                tipo: n.tipo,
                tentativas: n.tentativas,
                titulo: e.titulo,
                resumo: e.resumo,
                publicado: e.status === 'publicado' && !!e.fonteUrl,
                segue: e.alvos.some((a) => alvos.has(a)),
              };
            }),
        ),
      dispositivos: () =>
        Promise.resolve([...(this.dispositivos.get(usuarioId) ?? [])]),
      enviadasDesde: (instante: Date) =>
        Promise.resolve(
          this.doUsuario(usuarioId).filter(
            (n) => n.status === 'enviada' && n.enviadaEm! >= instante,
          ).length,
        ),
      registrar: (decisoes: Decisao[]) => {
        for (const d of decisoes) {
          const n = this.avisos.find((a) => a.id === d.id)!;
          n.status = d.status;
          if (d.status === 'enviada') {
            n.motivo = null;
            n.enviadaEm = d.em;
            n.titulo = d.titulo;
            n.corpo = d.corpo;
            n.dispositivos = d.dispositivos;
            n.tentativas += 1;
          } else if (d.status === 'pendente') {
            n.motivo = d.motivo;
            n.enviarApos = d.enviarApos;
            n.tentativas = d.tentativas;
          } else {
            n.motivo = d.motivo;
          }
        }
        return Promise.resolve();
      },
      removerDispositivo: (token: string) => {
        for (const [u, lista] of this.dispositivos) {
          this.dispositivos.set(
            u,
            lista.filter((d) => d.token !== token),
          );
        }
        return Promise.resolve();
      },
    };
  }
}
