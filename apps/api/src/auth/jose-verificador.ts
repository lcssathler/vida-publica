import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, errors, JWTVerifyGetKey, jwtVerify } from 'jose';
import { Env } from '../config/env';
import { Provedor } from './usuarios.repositorio';
import {
  IdentidadeInvalida,
  ProvedorDesligado,
  VerificadorIdentidade,
} from './verificador-identidade';

export interface ConfigProvedor {
  emissores: string[];
  audiencias: string[];
  chaves: JWTVerifyGetKey;
}

/** Endereços públicos das chaves e emissores dos tokens de identidade (OIDC). */
const APPLE_JWKS = 'https://appleid.apple.com/auth/keys';
const GOOGLE_JWKS = 'https://www.googleapis.com/oauth2/v3/certs';

/** Adaptador que confere assinatura, emissor, audiência e validade com `jose`. */
export class JoseVerificador extends VerificadorIdentidade {
  constructor(private readonly provedores: Record<Provedor, ConfigProvedor>) {
    super();
  }

  static daConfig(config: ConfigService<Env, true>): JoseVerificador {
    return new JoseVerificador({
      apple: {
        emissores: ['https://appleid.apple.com'],
        audiencias: config.get('APPLE_CLIENT_IDS', { infer: true }),
        chaves: createRemoteJWKSet(new URL(APPLE_JWKS)),
      },
      google: {
        emissores: ['https://accounts.google.com', 'accounts.google.com'],
        audiencias: config.get('GOOGLE_CLIENT_IDS', { infer: true }),
        chaves: createRemoteJWKSet(new URL(GOOGLE_JWKS)),
      },
    });
  }

  async verificar(provedor: Provedor, token: string): Promise<string> {
    const config = this.provedores[provedor];
    if (config.audiencias.length === 0) throw new ProvedorDesligado(provedor);
    try {
      const { payload } = await jwtVerify(token, config.chaves, {
        issuer: config.emissores,
        audience: config.audiencias,
        algorithms: ['RS256', 'ES256'],
        clockTolerance: 30,
      });
      if (!payload.sub) throw new IdentidadeInvalida('token sem sub');
      return payload.sub;
    } catch (erro) {
      if (erro instanceof errors.JOSEError) {
        throw new IdentidadeInvalida(erro.code);
      }
      throw erro;
    }
  }
}
