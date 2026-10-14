import { Inject, Injectable } from '@nestjs/common';
import { hashRefresh, Identificacao, TokenEmitido, Tokens } from './tokens';
import {
  Plataforma,
  Provedor,
  UsuariosRepositorio,
} from './usuarios.repositorio';
import { VerificadorIdentidade } from './verificador-identidade';

export interface ParDeTokens {
  usuarioId: string;
  acesso: TokenEmitido;
  refresh: TokenEmitido;
}

export class RefreshRecusado extends Error {
  constructor(readonly reusado: boolean) {
    super(reusado ? 'refresh token reutilizado' : 'refresh token inválido');
  }
}

export interface ResultadoLogin extends ParDeTokens {
  /** A conta anônima do aparelho foi fundida numa conta que já existia. */
  contaExistente: boolean;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(UsuariosRepositorio) private readonly usuarios: UsuariosRepositorio,
    @Inject(VerificadorIdentidade)
    private readonly verificador: VerificadorIdentidade,
    @Inject(Tokens) private readonly tokens: Tokens,
  ) {}

  /** Conta anônima por aparelho: o app chama na primeira abertura. */
  async anonimo(plataforma: Plataforma | null): Promise<ParDeTokens> {
    const refresh = this.tokens.refresh();
    const sessao = await this.usuarios.criarAnonimo(
      plataforma,
      refresh.hash,
      refresh.expiraEm,
    );
    return this.par(sessao, refresh);
  }

  /** Troca um refresh token por um par novo; o antigo deixa de valer. */
  async renovar(refreshToken: string): Promise<ParDeTokens> {
    const novo = this.tokens.refresh();
    const resultado = await this.usuarios.rotacionar(
      hashRefresh(refreshToken),
      novo.hash,
      novo.expiraEm,
    );
    if (resultado.status !== 'ok') {
      throw new RefreshRecusado(resultado.status === 'reusado');
    }
    return this.par(resultado, novo);
  }

  async sair(sessaoId: string): Promise<void> {
    await this.usuarios.revogarSessao(sessaoId, 'saida');
  }

  async sessaoAtiva(id: Identificacao): Promise<boolean> {
    return this.usuarios.sessaoAtiva(id.sessaoId, id.usuarioId);
  }

  /**
   * Login com Apple ou Google a partir da sessão do aparelho. Identidade nova
   * é vinculada ao usuário atual; identidade de outra conta leva a sessão para
   * ela (e, se o usuário atual era anônimo, o que ele seguia vai junto).
   */
  async entrar(
    atual: Identificacao,
    provedor: Provedor,
    tokenIdentidade: string,
  ): Promise<ResultadoLogin> {
    const sujeito = await this.verificador.verificar(provedor, tokenIdentidade);
    const dono = await this.usuarios.usuarioDaIdentidade(provedor, sujeito);
    let usuarioId = atual.usuarioId;
    if (dono === null) {
      await this.usuarios.vincularIdentidade(
        atual.usuarioId,
        provedor,
        sujeito,
      );
    } else if (dono !== atual.usuarioId) {
      const anonimo = !(await this.usuarios.temIdentidade(atual.usuarioId));
      await this.usuarios.moverSessao(
        atual.sessaoId,
        atual.usuarioId,
        dono,
        anonimo,
      );
      usuarioId = dono;
    }
    // O refresh antigo continua valendo só até o próximo uso; emitimos um par
    // novo porque o usuário do token de acesso pode ter mudado.
    const refresh = this.tokens.refresh();
    await this.usuarios.novoRefresh(
      atual.sessaoId,
      refresh.hash,
      refresh.expiraEm,
    );
    const par = await this.par(
      { usuarioId, sessaoId: atual.sessaoId },
      refresh,
    );
    return {
      ...par,
      contaExistente: dono !== null && dono !== atual.usuarioId,
    };
  }

  private async par(
    id: Identificacao,
    refresh: TokenEmitido,
  ): Promise<ParDeTokens> {
    return {
      usuarioId: id.usuarioId,
      acesso: await this.tokens.acesso(id),
      refresh: { token: refresh.token, expiraEm: refresh.expiraEm },
    };
  }
}
