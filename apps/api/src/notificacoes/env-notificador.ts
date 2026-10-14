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
  // Hora local (no fuso de cada conta) de segunda-feira em que sai o resumo
  // semanal da semana anterior.
  NOTIF_RESUMO_HORA: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'use HH:MM')
    .default('09:00'),
  // Só para rodadas avulsas de conferência (opção --agora do comando): o
  // relógio do notificador começa neste instante. Recusado no modo contínuo.
  NOTIF_AGORA: z.iso.datetime({ offset: true }).optional(),
  // Conta de serviço do Firebase: o JSON (FCM_CREDENCIAIS_JSON) ou o caminho
  // de um arquivo fora do repositório (FCM_CREDENCIAIS_ARQUIVO). Sem nenhuma,
  // o FCM fica desligado e o adaptador falso só registra os envios.
  FCM_CREDENCIAIS_JSON: z.string().optional(),
  FCM_CREDENCIAIS_ARQUIVO: z.string().optional(),
  // true: o FCM confere cada mensagem e token sem entregar (validate_only).
  FCM_VALIDAR_APENAS: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
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
