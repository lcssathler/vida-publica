/**
 * Datas e valores no formato brasileiro, sem depender do Intl do motor
 * JavaScript. Horário de Brasília: UTC−3 fixo (sem horário de verão desde 2019).
 */

const BRASILIA_MS = -3 * 60 * 60 * 1000;

const MESES = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
const MESES_EXTENSO = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];
const DIAS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
const DIAS_EXTENSO = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

export interface Partes {
  ano: number;
  mes: number; // 0 a 11
  dia: number;
  semana: number; // 0 = domingo
  hora: number;
  minuto: number;
}

const dois = (n: number) => String(n).padStart(2, '0');

/** Partes da data no horário de Brasília. */
export function emBrasilia(iso: string): Partes {
  const d = new Date(Date.parse(iso) + BRASILIA_MS);
  return {
    ano: d.getUTCFullYear(),
    mes: d.getUTCMonth(),
    dia: d.getUTCDate(),
    semana: d.getUTCDay(),
    hora: d.getUTCHours(),
    minuto: d.getUTCMinutes(),
  };
}

/** "14:32"; null quando o fato só tem data (meia-noite em Brasília). */
export function hora(iso: string): string | null {
  const p = emBrasilia(iso);
  return p.hora === 0 && p.minuto === 0 ? null : `${dois(p.hora)}:${dois(p.minuto)}`;
}

/** Chave do dia em Brasília, "2026-10-14", para agrupar e para o carimbo. */
export function diaIso(iso: string): string {
  const p = emBrasilia(iso);
  return `${p.ano}-${dois(p.mes + 1)}-${dois(p.dia)}`;
}

/** "QUA · 14 OUT 2026", cabeçalho de dia no feed. */
export function diaCurto(iso: string): string {
  const p = emBrasilia(iso);
  return `${DIAS[p.semana]} · ${dois(p.dia)} ${MESES[p.mes]} ${p.ano}`;
}

/**
 * Nome do dia no cabeçalho do feed: "Hoje", "Ontem" ou "14 de outubro"
 * (com o ano quando não é o atual). `agora` em ms, para testar.
 */
export function diaRelativo(iso: string, agora: number = Date.now()): string {
  const dia = diaIso(iso);
  const hoje = new Date(agora).toISOString();
  if (dia === diaIso(hoje)) return 'Hoje';
  if (dia === diaIso(new Date(agora - 24 * 60 * 60 * 1000).toISOString())) return 'Ontem';
  const p = emBrasilia(iso);
  const ano = p.ano === emBrasilia(hoje).ano ? '' : ` de ${p.ano}`;
  return `${p.dia} de ${MESES_EXTENSO[p.mes]}${ano}`;
}

/** "qua", dia da semana abreviado ao lado do nome do dia. */
export function semanaCurta(iso: string): string {
  return DIAS[emBrasilia(iso).semana].toLowerCase();
}

/** "quarta-feira, 14 de outubro de 2026", para o leitor de tela. */
export function diaPorExtenso(iso: string): string {
  const p = emBrasilia(iso);
  return `${DIAS_EXTENSO[p.semana]}, ${p.dia} de ${MESES_EXTENSO[p.mes]} de ${p.ano}`;
}

/** "14/10/2026". */
export function dataCurta(iso: string): string {
  const p = emBrasilia(iso);
  return `${dois(p.dia)}/${dois(p.mes + 1)}/${p.ano}`;
}

/** "R$ 5.351,48". */
export function reais(valor: number): string {
  const negativo = valor < 0;
  const [inteiro, centavos] = Math.abs(valor).toFixed(2).split('.');
  const milhares = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negativo ? '−' : ''}R$ ${milhares},${centavos}`;
}

/** "1.234". */
export function inteiro(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

const MINUSCULAS = new Set([
  'a', 'à', 'ao', 'aos', 'as', 'às', 'com', 'da', 'das', 'de', 'do', 'dos', 'e', 'em',
  'na', 'nas', 'no', 'nos', 'o', 'os', 'ou', 'para', 'pela', 'pelo', 'por',
]);

/** "DEPUTADO FEDERAL" → "Deputado Federal" (textos em caixa alta das fontes). */
export function capitalizar(texto: string): string {
  return texto
    .replace(/\s+,/g, ', ')
    .toLowerCase()
    .split(/\s+/)
    .map((p, i) => (i > 0 && MINUSCULAS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(' ');
}

/** "2023-02-01" (data sem hora) → "01/02/2023". */
export function dataSimples(data: string): string {
  const [ano, mes, dia] = data.slice(0, 10).split('-');
  return `${dia}/${mes}/${ano}`;
}

/** "1 repasse", "2 repasses". */
export function plural(n: number, um: string, varios: string): string {
  return `${inteiro(n)} ${n === 1 ? um : varios}`;
}
