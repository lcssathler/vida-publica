import { z } from 'zod';

/** Lista separada por vírgulas, sem itens vazios. */
const lista = z
  .string()
  .default('')
  .transform((valor) =>
    valor
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  );

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  // Conexão com o usuário vp_api: lê canon e feed, escreve só em app.
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  // Segredo HMAC dos tokens de acesso. Nunca versionado.
  JWT_SECRET: z.string().min(32),
  JWT_ACESSO_MINUTOS: z.coerce.number().int().min(1).max(60).default(15),
  REFRESH_DIAS: z.coerce.number().int().min(1).max(365).default(60),
  // Identificadores do app nos provedores (audiência dos tokens). Vazio desliga o login.
  APPLE_CLIENT_IDS: lista,
  GOOGLE_CLIENT_IDS: lista,
});

export type Env = z.infer<typeof envSchema>;

/**
 * Valida as variáveis de ambiente na subida da aplicação.
 * Falha cedo, com a lista de problemas, em vez de quebrar em tempo de execução.
 */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Configuração inválida: ${problems}`);
  }
  return result.data;
}
