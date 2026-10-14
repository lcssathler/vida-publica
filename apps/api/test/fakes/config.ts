import { ConfigService } from '@nestjs/config';
import { Env, validateEnv } from '../../src/config/env';

/** Configuração validada com os valores de teste do vitest.config.mts. */
export function configDeTeste(
  extra: Record<string, unknown> = {},
): ConfigService<Env, true> {
  return new ConfigService<Env, true>(
    validateEnv({ ...process.env, ...extra }),
  );
}
