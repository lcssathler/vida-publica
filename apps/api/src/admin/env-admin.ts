import { z } from 'zod';

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
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  // Conexão com o usuário vp_admin: lê raw, canon e feed, revisa eventos,
  // resolve casamentos, publica erratas e vê dos reportes só o conteúdo.
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(20).default(4),
  // IPs (ou faixas CIDR) que podem usar o painel. Vazio: ninguém.
  ADMIN_IPS: lista,
  // Segredo (32+ caracteres) de onde sai a chave AES-256 que cifra os
  // segredos do 2FA no banco. Nunca versionado.
  ADMIN_TOTP_CHAVE: z.string().min(32),
  ADMIN_SESSAO_HORAS: z.coerce.number().int().min(1).max(24).default(8),
  // Proxies confiáveis à frente (o painel Next.js manda o IP de quem acessa).
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
});

export type EnvAdmin = z.infer<typeof envSchema>;

export function validarEnvAdmin(raw: Record<string, unknown>): EnvAdmin {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const problemas = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Configuração inválida: ${problemas}`);
  }
  return result.data;
}
