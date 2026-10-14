import { defineConfig } from 'vitest/config';
import base from './vitest.config.mts';

/**
 * Testes de integração dos adaptadores Postgres. Precisam de um banco
 * descartável já migrado, acessado com o usuário vp_api:
 *   VP_API_TEST_DATABASE_URL=postgres://vp_api:<senha>@127.0.0.1:5433/vida_publica_test
 *   VP_NOTIFY_TEST_DATABASE_URL=postgres://vp_notify:<senha>@127.0.0.1:5433/vida_publica_test
 */
const url = process.env.VP_API_TEST_DATABASE_URL;
if (!url) {
  throw new Error('Defina VP_API_TEST_DATABASE_URL para os testes de integração');
}
// O notificador conecta com o próprio usuário (vp_notify).
if (!process.env.VP_NOTIFY_TEST_DATABASE_URL) {
  throw new Error('Defina VP_NOTIFY_TEST_DATABASE_URL (usuário vp_notify)');
}

export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ['test/integracao/**/*.int-spec.ts'],
    env: { ...base.test?.env, DATABASE_URL: url },
    // Os testes compartilham o banco: um arquivo por vez.
    fileParallelism: false,
  },
});
