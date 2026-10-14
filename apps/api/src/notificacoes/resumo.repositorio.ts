import { Dispositivo } from './enviador';
import { PreferenciasAviso } from './fila.repositorio';
import { ConteudoResumo, TotalPorTipo } from './resumo';

/** Usuário com o resumo da semana anterior já na hora de sair. */
export interface ResumoDevido {
  usuarioId: string;
  /** Segunda-feira (data local, AAAA-MM-DD) da semana resumida. */
  semana: string;
  fuso: string;
}

export interface ResumoPendente {
  semana: string;
  titulo: string;
  corpo: string;
  url: string;
  tentativas: number;
}

export type NovoResumo =
  | {
      status: 'pendente';
      conteudo: ConteudoResumo;
      titulo: string;
      corpo: string;
      url: string;
      enviarApos: Date;
      motivo: 'silencio' | null;
    }
  | { status: 'vazio'; conteudo: ConteudoResumo }
  | { status: 'descartado'; motivo: 'desligado'; conteudo: ConteudoResumo };

export type DecisaoResumo =
  | { status: 'enviado'; dispositivos: number; em: Date }
  | {
      status: 'pendente';
      motivo: 'silencio' | 'erro_envio';
      enviarApos: Date;
      tentativas: number;
    }
  | {
      status: 'descartado';
      motivo: 'desligado' | 'sem_dispositivo' | 'texto';
    }
  | { status: 'falhou'; motivo: 'erro_envio' };

/** O resumo de um usuário, com ele travado para os outros notificadores. */
export interface ResumoDoUsuario {
  preferencias(): Promise<PreferenciasAviso>;
  /**
   * Dinheiro e despesas de alvos seguidos publicados na janela, depois do
   * início da fila e de a pessoa passar a seguir (nada retroativo).
   */
  totais(
    desde: Date,
    ate: Date,
    tipos: readonly string[],
  ): Promise<TotalPorTipo[]>;
  /** Avisos que passaram do teto diário na janela. */
  excedentes(desde: Date, ate: Date): Promise<number>;
  /** Grava o resumo da semana; se já existe, não faz nada. */
  criar(semana: string, resumo: NovoResumo): Promise<boolean>;
  pendentes(agora: Date): Promise<ResumoPendente[]>;
  dispositivos(): Promise<Dispositivo[]>;
  registrar(semana: string, decisao: DecisaoResumo): Promise<void>;
  removerDispositivo(token: string): Promise<void>;
}

/** Porta: resumos semanais no banco. */
export abstract class ResumoRepositorio {
  /**
   * Usuários que seguem algo e ainda não têm o resumo da semana anterior,
   * quando no fuso deles já passou da hora de envio da segunda-feira.
   */
  abstract devidos(
    agora: Date,
    horaMinutos: number,
    limite: number,
    excluir: readonly string[],
  ): Promise<ResumoDevido[]>;

  /** Usuários com resumo pendente cuja vez chegou, fora os já vistos. */
  abstract usuariosComPendentes(
    agora: Date,
    limite: number,
    excluir: readonly string[],
  ): Promise<string[]>;

  abstract comUsuario<T>(
    usuarioId: string,
    fn: (resumo: ResumoDoUsuario) => Promise<T>,
  ): Promise<T | null>;
}
