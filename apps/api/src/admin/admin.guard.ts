import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import type { SessaoAdmin } from './contas.repositorio';
import { ContasAdminService } from './contas.service';
import { IpsPermitidos } from './ips';

const LIVRE = 'vp:admin:livre';
const SEM_SESSAO = 'vp:admin:sem-sessao';

/** Rota sem IP nem sessão (só a saúde, para o healthcheck do contêiner). */
export const Livre = () => SetMetadata(LIVRE, true);
/** Rota que confere o IP mas não exige sessão (o login). */
export const SemSessao = () => SetMetadata(SEM_SESSAO, true);

type RequisicaoAdmin = Request & { admin?: SessaoAdmin };

export const AdminAtual = createParamDecorator(
  (_dado: unknown, contexto: ExecutionContext): SessaoAdmin => {
    const req = contexto.switchToHttp().getRequest<RequisicaoAdmin>();
    if (!req.admin) throw new UnauthorizedException();
    return req.admin;
  },
);

/**
 * Guarda global do painel: o IP precisa estar na lista (ADMIN_IPS) e, salvo
 * no login, a sessão do painel precisa estar em vigor (Bearer). Contas do app
 * não servem aqui: são outra tabela e outro token.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(IpsPermitidos) private readonly ips: IpsPermitidos,
    @Inject(ContasAdminService) private readonly contas: ContasAdminService,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const alvos = [contexto.getHandler(), contexto.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(LIVRE, alvos)) return true;
    const req = contexto.switchToHttp().getRequest<RequisicaoAdmin>();
    if (!this.ips.permite(req.ip)) {
      throw new ForbiddenException('Endereço sem acesso ao painel');
    }
    if (this.reflector.getAllAndOverride<boolean>(SEM_SESSAO, alvos)) {
      return true;
    }
    const [esquema, token] = (req.headers.authorization ?? '').split(' ');
    if (esquema !== 'Bearer' || !token) {
      throw new UnauthorizedException('Sessão do painel ausente');
    }
    const sessao = await this.contas.sessao(token);
    if (!sessao) throw new UnauthorizedException('Sessão do painel encerrada');
    req.admin = sessao;
    return true;
  }
}
