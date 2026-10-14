import { Dispositivo } from './enviador';

export interface PreferenciasAviso {
  notificacoes: boolean;
  resumoSemanal: boolean;
  maxPorDia: number;
  silencioInicio: string;
  silencioFim: string;
  fuso: string;
}

/** Aviso na fila, com o estado atual do evento e de quem recebe. */
export interface Pendente {
  id: string;
  eventoId: string;
  tipo: string;
  tentativas: number;
  titulo: string;
  resumo: string | null;
  /** O evento continua publicado e com fonte. */
  publicado: boolean;
  /** O usuário ainda segue algum alvo do evento. */
  segue: boolean;
}

/** O que fazer com cada aviso pendente. */
export type Decisao =
  | {
      id: string;
      status: 'enviada';
      titulo: string;
      corpo: string;
      dispositivos: number;
      em: Date;
    }
  | {
      id: string;
      status: 'pendente';
      motivo: 'silencio' | 'erro_envio';
      enviarApos: Date;
      tentativas: number;
    }
  | { id: string; status: 'resumo'; motivo: 'teto' }
  | {
      id: string;
      status: 'descartada';
      motivo:
        | 'desligada'
        | 'sem_dispositivo'
        | 'nao_segue'
        | 'despublicado'
        | 'texto';
    }
  | { id: string; status: 'falhou'; motivo: 'erro_envio' };

/** Os avisos de um usuário, com ele travado para os outros notificadores. */
export interface FilaDoUsuario {
  preferencias(): Promise<PreferenciasAviso>;
  /** Pendentes com a vez chegada (enviar_apos ≤ agora), na ordem da fila. */
  pendentes(agora: Date): Promise<Pendente[]>;
  /** Aparelhos das sessões ativas do usuário. */
  dispositivos(): Promise<Dispositivo[]>;
  /** Quantos avisos chegaram ao usuário desde o instante (teto diário). */
  enviadasDesde(instante: Date): Promise<number>;
  registrar(decisoes: Decisao[]): Promise<void>;
  removerDispositivo(token: string): Promise<void>;
}

export interface Enfileiramento {
  /** Primeira execução: só marcou o instante, nada foi enfileirado. */
  inicial: boolean;
  enfileiradas: number;
  /** Janela de publicação lida (desde exclui, ate inclui). */
  desde: Date | null;
  ate: Date;
}

export interface ParametrosEnfileirar {
  ate: Date;
  /** Releitura antes do cursor: pega publicações de transações lentas. */
  margemMs: number;
  tipos: readonly string[];
  /** Fato mais antigo que isso na publicação não gera aviso (sem push retroativo). */
  frescorDias: number;
}

/** Porta: fila de avisos no banco. */
export abstract class FilaRepositorio {
  /**
   * Põe na fila um aviso por usuário e evento publicado desde o cursor, para
   * quem já seguia um alvo do evento quando ele foi publicado e não desligou
   * os avisos; avança o cursor. Repetir não duplica (um por usuário e evento).
   */
  abstract enfileirar(p: ParametrosEnfileirar): Promise<Enfileiramento>;

  /** Usuários com aviso pendente cuja vez chegou, fora os já vistos. */
  abstract usuariosComPendentes(
    agora: Date,
    limite: number,
    excluir: readonly string[],
  ): Promise<string[]>;

  /**
   * Roda `fn` numa transação com o usuário travado. Se outro notificador já
   * está com ele, não roda e devolve null.
   */
  abstract comUsuario<T>(
    usuarioId: string,
    fn: (fila: FilaDoUsuario) => Promise<T>,
  ): Promise<T | null>;
}
