import { Plataforma } from './enviador';

/** Porta: aparelho que recebe avisos, um por sessão. */
export abstract class DispositivosRepositorio {
  /**
   * Grava o token de envio da sessão (troca o anterior). Se o mesmo token
   * estava em outra sessão (o aparelho trocou de conta), sai de lá.
   */
  abstract registrar(
    sessaoId: string,
    token: string,
    plataforma: Plataforma,
  ): Promise<void>;

  abstract remover(sessaoId: string): Promise<boolean>;

  abstract daSessao(
    sessaoId: string,
  ): Promise<{ plataforma: Plataforma; registradoEm: Date } | null>;
}
