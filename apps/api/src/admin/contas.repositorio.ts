export interface ContaAdmin {
  id: string;
  email: string;
  nome: string;
  senhaHash: string;
  /** Segredo do 2FA cifrado (v1.<iv>.<tag>.<cifrado>). */
  totpSegredo: string;
  totpUltimoPasso: number;
  ativo: boolean;
  falhas: number;
  bloqueadoAte: Date | null;
}

export interface SessaoAdmin {
  sessaoId: string;
  usuarioId: string;
  nome: string;
  email: string;
  expiraEm: Date;
}

/** Porta das contas do painel (esquema admin), separadas das contas do app. */
export abstract class ContasAdminRepositorio {
  abstract porEmail(email: string): Promise<ContaAdmin | null>;

  /** Conta uma tentativa errada; com `bloquearAte`, a conta espera até lá. */
  abstract registrarFalha(
    id: string,
    bloquearAte: Date | null,
  ): Promise<number>;

  /**
   * Login aceito: zera as falhas e grava o passo do código usado. Falso se
   * esse passo (ou um posterior) já tinha sido usado: código reaproveitado.
   */
  abstract registrarAcesso(id: string, passo: number): Promise<boolean>;

  abstract criarSessao(
    usuarioId: string,
    tokenHash: string,
    ip: string | null,
    expiraEm: Date,
  ): Promise<string>;

  /** Sessão em vigor (não expirou, não saiu, conta ativa) pelo hash do token. */
  abstract sessaoAtiva(tokenHash: string): Promise<SessaoAdmin | null>;

  abstract encerrarSessao(sessaoId: string): Promise<void>;

  abstract criar(dados: {
    email: string;
    nome: string;
    senhaHash: string;
    totpSegredo: string;
  }): Promise<string>;

  /** Troca senha e/ou 2FA e encerra as sessões abertas. */
  abstract redefinir(
    email: string,
    dados: { senhaHash?: string; totpSegredo?: string },
  ): Promise<boolean>;

  abstract desativar(email: string): Promise<boolean>;
}
