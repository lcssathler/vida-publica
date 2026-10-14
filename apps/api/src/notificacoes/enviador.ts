export type Plataforma = 'android' | 'ios';

export interface Dispositivo {
  sessaoId: string;
  /** Token de envio do FCM. */
  token: string;
  plataforma: Plataforma;
}

export interface MensagemPush {
  titulo: string;
  corpo: string;
  /** Dados entregues ao app junto do aviso (o link abre o registro). */
  dados: { url: string; eventoId?: string };
}

/**
 * Resultado por aparelho:
 * - ok: o FCM aceitou;
 * - token_invalido: o FCM diz que o token não vale mais (app desinstalado,
 *   token trocado): o aparelho é apagado;
 * - temporario: falha passageira (limite, indisponibilidade): tenta de novo;
 * - erro: falha que não se resolve tentando de novo (mensagem recusada).
 */
export type ResultadoEnvio = 'ok' | 'token_invalido' | 'temporario' | 'erro';

/** Porta: envio de push. Adaptadores: FCM HTTP v1 e o falso, que só registra. */
export abstract class Enviador {
  abstract readonly nome: string;

  abstract enviar(
    mensagem: MensagemPush,
    dispositivo: Dispositivo,
  ): Promise<ResultadoEnvio>;
}

/** Porta: hora atual (os testes controlam o relógio). */
export abstract class Relogio {
  abstract agora(): Date;
}

export class RelogioDoSistema extends Relogio {
  agora(): Date {
    return new Date();
  }
}

/**
 * Relógio que começa num instante dado e anda junto com o do sistema. Só
 * para rodadas avulsas de conferência (ex.: o resumo de segunda-feira).
 */
export class RelogioSimulado extends Relogio {
  private readonly diferenca: number;

  constructor(inicio: Date) {
    super();
    this.diferenca = inicio.getTime() - Date.now();
  }

  agora(): Date {
    return new Date(Date.now() + this.diferenca);
  }
}
