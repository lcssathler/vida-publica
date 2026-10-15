import { trace } from '@opentelemetry/api';

/**
 * Acrescenta a cada linha de log o trace e o span do OpenTelemetry em curso,
 * para achar no Sentry a requisição de um log (e o contrário).
 */
export function idsDoTrace(): Record<string, string> {
  const span = trace.getActiveSpan();
  if (!span) return {};
  const { traceId, spanId } = span.spanContext();
  return { trace_id: traceId, span_id: spanId };
}
