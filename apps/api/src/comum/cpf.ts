/**
 * CPF formatado (000.000.000-00) ou 11 dígitos seguidos, sem ser pedaço de um
 * número maior (CNPJ, protocolo).
 */
const PARECE_CPF =
  /(?<![\d.\-/])(?:\d{3}\.\d{3}\.\d{3}-\d{2}|\d{11})(?![\d\-/]|\.\d)/;
const PARECE_CPF_GLOBAL = new RegExp(PARECE_CPF.source, 'g');

/** O texto tem algo parecido com CPF. */
export function pareceCpf(texto: string): boolean {
  return PARECE_CPF.test(texto);
}

/** Troca o que parece CPF por um aviso: CPF nunca é guardado nem mostrado. */
export function semCpf(texto: string): string {
  return texto.replace(PARECE_CPF_GLOBAL, '[CPF removido]');
}
