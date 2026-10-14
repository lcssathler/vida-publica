import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { Identificacao, TokenInvalido, Tokens } from './tokens';

const PUBLICO = 'vp:publico';

/** Rota que não exige token de acesso (saúde, criação de conta, renovação). */
export const Publico = () => SetMetadata(PUBLICO, true);

type RequisicaoAutenticada = Request & { usuario?: Identificacao };

/** Usuário e sessão do token de acesso da requisição. */
export const UsuarioAtual = createParamDecorator(
  (_dado: unknown, contexto: ExecutionContext): Identificacao => {
    const req = contexto.switchToHttp().getRequest<RequisicaoAutenticada>();
    if (!req.usuario) throw new UnauthorizedException();
    return req.usuario;
  },
);

/**
 * Guarda global: toda rota exige `Authorization: Bearer <token de acesso>`,
 * salvo as marcadas com @Publico(). Confere também se a sessão não foi
 * revogada (saída, reuso de refresh ou conta excluída).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(Tokens) private readonly tokens: Tokens,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const publico = this.reflector.getAllAndOverride<boolean>(PUBLICO, [
      contexto.getHandler(),
      contexto.getClass(),
    ]);
    if (publico) return true;

    const req = contexto.switchToHttp().getRequest<RequisicaoAutenticada>();
    const [esquema, token] = (req.headers.authorization ?? '').split(' ');
    if (esquema !== 'Bearer' || !token) {
      throw new UnauthorizedException('Token de acesso ausente');
    }
    let id: Identificacao;
    try {
      id = await this.tokens.verificarAcesso(token);
    } catch (erro) {
      if (erro instanceof TokenInvalido) {
        throw new UnauthorizedException('Token de acesso inválido');
      }
      throw erro;
    }
    if (!(await this.auth.sessaoAtiva(id))) {
      throw new UnauthorizedException('Sessão encerrada');
    }
    req.usuario = id;
    return true;
  }
}
