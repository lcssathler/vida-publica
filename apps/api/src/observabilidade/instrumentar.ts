/**
 * Primeiro import de cada processo (API, notificador, API do admin): liga o
 * Sentry, que monta o OpenTelemetry e instrumenta HTTP, Express e Postgres
 * antes de esses módulos serem carregados. Spans criados com
 * `@opentelemetry/api` vão para o mesmo destino. Sem SENTRY_DSN, nada é
 * ligado nem enviado (o tracer do OpenTelemetry fica no modo sem efeito).
 */
import * as Sentry from '@sentry/node';
import { limparEvento, limparSpan, type EventoSentry } from './limpeza';

const dsn = process.env.SENTRY_DSN ?? '';

/** Segredos que podem aparecer em URLs de saída (o ping do healthchecks.io). */
const segredos = [process.env.HEALTHCHECKS_PING_KEY].filter(
  (s): s is string => typeof s === 'string' && s.length >= 8,
);

export const sentryLigado = dsn.length > 0;

if (sentryLigado) {
  Sentry.init({
    dsn,
    environment:
      process.env.SENTRY_AMBIENTE ?? process.env.NODE_ENV ?? 'development',
    release: process.env.SENTRY_RELEASE,
    serverName: process.env.VP_SERVICO ?? 'api',
    // O Sentry registra o provedor global do OpenTelemetry: spans criados com
    // @opentelemetry/api (como o ciclo do notificador) viram spans do Sentry.
    enableOpenTelemetrySetup: true,
    // Nada de dado pessoal: sem usuário, cookies, cabeçalhos, corpos nem a
    // consulta das URLs (o que alguém busca pode revelar opinião). A limpeza
    // abaixo repete o corte, para o que escapar das integrações.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
    },
    tracesSampleRate: Number(process.env.SENTRY_AMOSTRA_TRACES ?? '0.2'),
    beforeSend: (evento) =>
      limparEvento(evento as EventoSentry) as typeof evento,
    beforeSendSpan: (span) => limparSpan(span, segredos),
    beforeBreadcrumb: (migalha) => {
      // Sem console nem corpo de requisição nas migalhas.
      if (migalha.category === 'console') return null;
      return migalha;
    },
  });
}

/** Registra um erro inesperado no Sentry (sem Sentry ligado, não faz nada). */
export function capturarErro(
  erro: unknown,
  contexto: Record<string, unknown> = {},
): void {
  if (!sentryLigado) return;
  Sentry.withScope((escopo) => {
    escopo.setContext('vida-publica', contexto);
    Sentry.captureException(erro);
  });
}

/** Espera os eventos pendentes saírem antes de o processo terminar. */
export async function esvaziar(): Promise<void> {
  if (sentryLigado) await Sentry.flush(2000);
}
