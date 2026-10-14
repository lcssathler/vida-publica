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
  // Limite de requisições: por usuário (rotas autenticadas), por IP (rotas
  // públicas) e contas anônimas novas por IP a cada 10 minutos.
  LIMITE_POR_MINUTO: z.coerce.number().int().min(1).default(120),
  LIMITE_IP_POR_MINUTO: z.coerce.number().int().min(1).default(30),
  LIMITE_CONTAS_POR_IP: z.coerce.number().int().min(1).default(10),
  // Proxies confiáveis à frente da API (balanceador): o IP real vem do
  // X-Forwarded-For. 0 = conexão direta.
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
  // Origens aceitas por CORS (versão web do app no desenvolvimento, ex.:
  // http://localhost:8081). Vazio desliga: o app nativo não usa CORS.
  CORS_ORIGENS: lista.pipe(z.array(z.url({ protocol: /^https?$/ }))),
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
