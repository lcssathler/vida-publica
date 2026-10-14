import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { errors, jwtVerify, SignJWT } from 'jose';
import { Env } from '../config/env';

const EMISSOR = 'vida-publica-api';
const AUDIENCIA = 'vida-publica-app';

export interface Identificacao {
  usuarioId: string;
  sessaoId: string;
}

export interface TokenEmitido {
  token: string;
  expiraEm: Date;
}

export class TokenInvalido extends Error {}

/** Hash guardado no banco: o refresh token em si só existe no aparelho. */
export function hashRefresh(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Tokens de acesso (JWT curto, HS256) e refresh tokens (aleatórios, opacos). */
@Injectable()
export class Tokens {
  private readonly segredo: Uint8Array;
  private readonly acessoMinutos: number;
  private readonly refreshDias: number;

  constructor(@Inject(ConfigService) config: ConfigService<Env, true>) {
    this.segredo = new TextEncoder().encode(
      config.get('JWT_SECRET', { infer: true }),
    );
    this.acessoMinutos = config.get('JWT_ACESSO_MINUTOS', { infer: true });
    this.refreshDias = config.get('REFRESH_DIAS', { infer: true });
  }

  async acesso(id: Identificacao, agora = new Date()): Promise<TokenEmitido> {
    const expiraEm = new Date(agora.getTime() + this.acessoMinutos * 60_000);
    const token = await new SignJWT({ sid: id.sessaoId })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuer(EMISSOR)
      .setAudience(AUDIENCIA)
      .setSubject(id.usuarioId)
      .setIssuedAt(Math.floor(agora.getTime() / 1000))
      .setExpirationTime(Math.floor(expiraEm.getTime() / 1000))
      .sign(this.segredo);
    return { token, expiraEm };
  }

  async verificarAcesso(token: string): Promise<Identificacao> {
    try {
      const { payload } = await jwtVerify(token, this.segredo, {
        issuer: EMISSOR,
        audience: AUDIENCIA,
        algorithms: ['HS256'],
      });
      if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') {
        throw new TokenInvalido('token sem sub ou sid');
      }
      return { usuarioId: payload.sub, sessaoId: payload.sid };
    } catch (erro) {
      if (erro instanceof errors.JOSEError) throw new TokenInvalido(erro.code);
      throw erro;
    }
  }

  refresh(agora = new Date()): TokenEmitido & { hash: string } {
    const token = randomBytes(32).toString('base64url');
    const expiraEm = new Date(agora.getTime() + this.refreshDias * 86_400_000);
    return { token, hash: hashRefresh(token), expiraEm };
  }
}
