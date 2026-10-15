import { semCpf } from '../comum/cpf';

/** O que importa de um evento do Sentry para a limpeza (o tipo dele é mais largo). */
export interface EventoSentry {
  message?: string;
  request?: Record<string, unknown>;
  user?: unknown;
  breadcrumbs?: Array<{ data?: Record<string, unknown>; message?: string }>;
  exception?: { values?: Array<{ value?: string }> };
  spans?: Array<{ data?: Record<string, unknown>; description?: string }>;
  contexts?: Record<string, Record<string, unknown> | undefined>;
}

/** Tira a consulta (?q=...) de um endereço: o que alguém busca pode revelar opinião. */
export function semConsulta(url: string): string {
  const i = url.search(/[?#]/);
  return i < 0 ? url : url.slice(0, i);
}

const CHAVES_COM_URL = [
  'url',
  'http.url',
  'url.full',
  'http.target',
  'to',
  'from',
];
const CHAVES_DE_CONSULTA = ['url.query', 'http.query', 'query'];

function limparDados(dados: Record<string, unknown> | undefined): void {
  if (!dados) return;
  for (const chave of CHAVES_DE_CONSULTA) delete dados[chave];
  for (const chave of CHAVES_COM_URL) {
    const valor = dados[chave];
    if (typeof valor === 'string') dados[chave] = semConsulta(valor);
  }
}

/** Atributos que identificam quem acessa (aparelho, rede) ou levam o que foi buscado. */
const ATRIBUTOS_FORA = [
  'user_agent.original',
  'client.address',
  'client.port',
  'network.peer.address',
  'network.peer.port',
  'http.client_ip',
  'url.query',
  'http.query',
];
const ATRIBUTOS_COM_URL = ['url.full', 'http.url', 'http.target', 'url.path'];

/**
 * Span do OpenTelemetry a caminho do Sentry (beforeSendSpan): sem os atributos
 * de quem acessa e com as URLs sem a consulta. As consultas ao banco já vão
 * parametrizadas ($1), sem os valores.
 */
export function limparSpan<
  T extends { name: string; attributes: Record<string, unknown> },
>(span: T, segredos: readonly string[] = []): T {
  const mascarar = (texto: string) =>
    segredos.reduce((t, s) => t.split(s).join('[segredo]'), semConsulta(texto));
  for (const chave of ATRIBUTOS_FORA) delete span.attributes[chave];
  for (const chave of ATRIBUTOS_COM_URL) {
    const valor = span.attributes[chave];
    if (typeof valor === 'string') span.attributes[chave] = mascarar(valor);
  }
  span.name = mascarar(span.name);
  return span;
}

/**
 * Nada de dado pessoal no Sentry: sem cabeçalhos, cookies, corpo nem IP da
 * requisição, sem usuário, endereços sem a consulta e o que parece CPF trocado.
 * Vale para os erros (beforeSend); os spans passam por limparSpan.
 */
export function limparEvento<T extends EventoSentry>(evento: T): T {
  if (evento.request) {
    const url = evento.request.url;
    evento.request = {
      ...(typeof url === 'string' ? { url: semConsulta(url) } : {}),
      ...(typeof evento.request.method === 'string'
        ? { method: evento.request.method }
        : {}),
    };
  }
  delete evento.user;
  if (evento.message) evento.message = semCpf(evento.message);
  for (const valor of evento.exception?.values ?? []) {
    if (valor.value) valor.value = semCpf(valor.value);
  }
  for (const migalha of evento.breadcrumbs ?? []) {
    limparDados(migalha.data);
    if (migalha.message) migalha.message = semCpf(semConsulta(migalha.message));
  }
  for (const span of evento.spans ?? []) {
    limparDados(span.data);
    if (span.description) span.description = semConsulta(span.description);
  }
  limparDados(
    evento.contexts?.trace?.data as Record<string, unknown> | undefined,
  );
  return evento;
}
