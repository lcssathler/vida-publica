/** Resposta de erro da API (corpo do NestJS: { message, statusCode }). */
export class ErroApi extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ErroApi';
  }
}

/** 429: o app espera `segundos` antes de tentar de novo (Retry-After). */
export class ErroLimite extends ErroApi {
  constructor(readonly segundos: number) {
    super(429, `Muitas requisições. Tente de novo em ${segundos} s.`);
    this.name = 'ErroLimite';
  }
}

/** Sem resposta do servidor: sem internet, servidor fora ou tempo esgotado. */
export class ErroRede extends Error {
  constructor(message = 'Sem conexão com o servidor.') {
    super(message);
    this.name = 'ErroRede';
  }
}

/**
 * Retry-After em segundos: número de segundos ou data HTTP. Sem cabeçalho
 * (ou inválido), 60 s; nunca menos de 1.
 */
export function segundosRetryAfter(valor: string | null, agora = Date.now()): number {
  if (!valor) return 60;
  const numero = Number(valor.trim());
  if (Number.isFinite(numero)) return Math.max(1, Math.ceil(numero));
  const data = Date.parse(valor);
  if (Number.isNaN(data)) return 60;
  return Math.max(1, Math.ceil((data - agora) / 1000));
}

/** Texto para a tela, em português. */
export function mensagemDeErro(erro: unknown): string {
  if (erro instanceof ErroLimite || erro instanceof ErroRede) return erro.message;
  if (erro instanceof ErroApi) {
    if (erro.status === 404) return 'Não encontrado.';
    if (erro.status >= 500) return 'O servidor teve um problema. Tente de novo em instantes.';
    return erro.message;
  }
  return 'Algo deu errado. Tente de novo.';
}
