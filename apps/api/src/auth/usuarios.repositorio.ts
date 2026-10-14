export type Provedor = 'apple' | 'google';
export type Plataforma = 'ios' | 'android' | 'web';
export type MotivoRevogacao = 'saida' | 'reuso' | 'exclusao';

export interface SessaoCriada {
  usuarioId: string;
  sessaoId: string;
}

/** Resultado de apresentar um refresh token para trocar por um novo. */
export type ResultadoRotacao =
  | { status: 'ok'; usuarioId: string; sessaoId: string }
  /** O token já tinha sido usado: a sessão foi revogada. */
  | { status: 'reusado' }
  /** Desconhecido, expirado ou de sessão revogada. */
  | { status: 'invalido' };

/**
 * Porta de persistência de usuários, sessões e identidades externas.
 * Os tokens chegam aqui só como hash.
 */
export abstract class UsuariosRepositorio {
  /** Cria um usuário anônimo com uma sessão e o primeiro refresh token. */
  abstract criarAnonimo(
    plataforma: Plataforma | null,
    refreshHash: string,
    refreshExpiraEm: Date,
  ): Promise<SessaoCriada>;

  /**
   * Marca o token como usado e grava o próximo na mesma sessão, atomicamente.
   * Se o token já tinha sido usado, revoga a sessão (o token vazou).
   */
  abstract rotacionar(
    hashAtual: string,
    hashNovo: string,
    novoExpiraEm: Date,
  ): Promise<ResultadoRotacao>;

  /**
   * Grava um refresh token novo na sessão (após o login) e descarta os ainda
   * não usados dela: só o último par emitido continua valendo.
   */
  abstract novoRefresh(
    sessaoId: string,
    hash: string,
    expiraEm: Date,
  ): Promise<void>;

  abstract revogarSessao(
    sessaoId: string,
    motivo: MotivoRevogacao,
  ): Promise<void>;

  abstract sessaoAtiva(sessaoId: string, usuarioId: string): Promise<boolean>;

  abstract usuarioDaIdentidade(
    provedor: Provedor,
    sujeito: string,
  ): Promise<string | null>;

  abstract temIdentidade(usuarioId: string): Promise<boolean>;

  abstract vincularIdentidade(
    usuarioId: string,
    provedor: Provedor,
    sujeito: string,
  ): Promise<void>;

  /**
   * Leva a sessão para outro usuário (login numa conta que já existe). Se
   * `fundir`, o usuário de origem é anônimo: o que ele seguia passa para o
   * destino e ele é apagado.
   */
  abstract moverSessao(
    sessaoId: string,
    origemId: string,
    destinoId: string,
    fundir: boolean,
  ): Promise<void>;
}
