import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  // Conexão com o usuário vp_notify: lê feed e quem segue o quê, escreve a fila.
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(20).default(4),
  // Intervalo entre rodadas no modo contínuo.
  NOTIF_INTERVALO_SEGUNDOS: z.coerce
    .number()
    .int()
    .min(5)
    .max(3600)
    .default(60),
  // Releitura antes do cursor (publicações de transações demoradas do motor).
  NOTIF_MARGEM_MINUTOS: z.coerce.number().int().min(0).max(1440).default(120),
  // Fato mais antigo que isso quando foi publicado não gera aviso.
  NOTIF_FRESCOR_DIAS: z.coerce.number().int().min(1).max(60).default(7),
  NOTIF_LOTE: z.coerce.number().int().min(1).max(5000).default(200),
  NOTIF_MAX_TENTATIVAS: z.coerce.number().int().min(1).max(20).default(5),
});

export type EnvNotificador = z.infer<typeof envSchema>;

/** Valida as variáveis do notificador na subida (falha cedo, com a lista). */
export function validarEnvNotificador(
  raw: Record<string, unknown>,
): EnvNotificador {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Configuração inválida: ${problems}`);
  }
  return result.data;
}
