import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';
import type { Identificacao } from '../auth/tokens';
import { ContadorRequisicoes } from './contador';
import { LIMITE, Limites, NomePolitica } from './politicas';

/**
 * Limite de requisições. Roda depois da guarda de autenticação (registrada
 * antes), então nas rotas autenticadas conta por usuário, não por IP: muitos
 * aparelhos saem pelo mesmo IP na rede móvel.
 */
@Injectable()
export class LimiteGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(ContadorRequisicoes) private readonly contador: ContadorRequisicoes,
    @Inject(Limites) private readonly limites: Limites,
  ) {}

  canActivate(contexto: ExecutionContext): boolean {
    const req = contexto
      .switchToHttp()
      .getRequest<Request & { usuario?: Identificacao }>();
    const res = contexto.switchToHttp().getResponse<Response>();
    const definida = this.reflector.getAllAndOverride<
      NomePolitica | null | undefined
    >(LIMITE, [contexto.getHandler(), contexto.getClass()]);
    if (definida === null) return true;
    const nome: NomePolitica = definida ?? (req.usuario ? 'usuario' : 'ip');
    const politica = this.limites.politicas[nome];
    const quem =
      politica.por === 'usuario' && req.usuario
        ? `u:${req.usuario.usuarioId}`
        : `ip:${req.ip ?? 'desconhecido'}`;
    const registro = this.contador.registrar(
      `${nome}:${quem}`,
      politica.max,
      politica.janelaMs,
    );
    res.setHeader('RateLimit-Limit', registro.limite);
    res.setHeader('RateLimit-Remaining', registro.restantes);
    res.setHeader('RateLimit-Reset', registro.reiniciaEm);
    if (!registro.permitido) {
      res.setHeader('Retry-After', registro.reiniciaEm);
      throw new HttpException(
        'Muitas requisições: tente de novo em instantes',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
