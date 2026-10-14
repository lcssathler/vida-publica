/** Sem acento e em minúsculas, como canon.normaliza no banco. */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Consulta para to_tsquery: só letras e números (nada que o parser do
 * Postgres interprete), todas as palavras obrigatórias e a última como
 * prefixo, para achar enquanto a pessoa digita ("reforma trib" acha
 * "reforma tributária"). null se não sobra palavra.
 */
export function consultaTextual(texto: string): string | null {
  const palavras = normalizar(texto).match(/[a-z0-9]+/g);
  if (!palavras) return null;
  return palavras
    .map((p, i) => (i === palavras.length - 1 ? `${p}:*` : p))
    .join(' & ');
}

const IDENTIFICACAO = /^([a-z]{2,6})\s*(\d{1,6})(?:\s*\/\s*(\d{2}|\d{4}))?$/;

/**
 * "PL 2338/2023", "pl2338", "PEC 45/19": sigla, número e ano (com século).
 */
export function identificacaoDeProposta(
  texto: string,
): { sigla: string; numero: number; ano: number | null } | null {
  const m = IDENTIFICACAO.exec(normalizar(texto));
  if (!m) return null;
  let ano = m[3] ? Number(m[3]) : null;
  if (ano !== null && ano < 100) ano += ano > 50 ? 1900 : 2000;
  return { sigla: m[1].toUpperCase(), numero: Number(m[2]), ano };
}
