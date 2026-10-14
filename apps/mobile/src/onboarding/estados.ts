import type { Uf } from '../api/tipos';

export const NOME_ESTADO: Record<Uf, string> = {
  AC: 'Acre',
  AL: 'Alagoas',
  AP: 'Amapá',
  AM: 'Amazonas',
  BA: 'Bahia',
  CE: 'Ceará',
  DF: 'Distrito Federal',
  ES: 'Espírito Santo',
  GO: 'Goiás',
  MA: 'Maranhão',
  MT: 'Mato Grosso',
  MS: 'Mato Grosso do Sul',
  MG: 'Minas Gerais',
  PA: 'Pará',
  PB: 'Paraíba',
  PR: 'Paraná',
  PE: 'Pernambuco',
  PI: 'Piauí',
  RJ: 'Rio de Janeiro',
  RN: 'Rio Grande do Norte',
  RS: 'Rio Grande do Sul',
  RO: 'Rondônia',
  RR: 'Roraima',
  SC: 'Santa Catarina',
  SP: 'São Paulo',
  SE: 'Sergipe',
  TO: 'Tocantins',
};

/** Estados em ordem alfabética do nome (como a pessoa procura). */
export const ESTADOS_POR_NOME = (Object.keys(NOME_ESTADO) as Uf[]).sort((a, b) =>
  NOME_ESTADO[a].localeCompare(NOME_ESTADO[b], 'pt-BR'),
);

/**
 * Faixas de CEP por estado (cinco primeiros dígitos), dos Correios. A
 * conversão acontece só no aparelho: o CEP nunca vai para a API.
 */
const FAIXAS: [number, number, Uf][] = [
  [1000, 19999, 'SP'],
  [20000, 28999, 'RJ'],
  [29000, 29999, 'ES'],
  [30000, 39999, 'MG'],
  [40000, 48999, 'BA'],
  [49000, 49999, 'SE'],
  [50000, 56999, 'PE'],
  [57000, 57999, 'AL'],
  [58000, 58999, 'PB'],
  [59000, 59999, 'RN'],
  [60000, 63999, 'CE'],
  [64000, 64999, 'PI'],
  [65000, 65999, 'MA'],
  [66000, 68899, 'PA'],
  [68900, 68999, 'AP'],
  [69000, 69299, 'AM'],
  [69300, 69399, 'RR'],
  [69400, 69899, 'AM'],
  [69900, 69999, 'AC'],
  [70000, 72799, 'DF'],
  [72800, 72999, 'GO'],
  [73000, 73699, 'DF'],
  [73700, 76799, 'GO'],
  [76800, 76999, 'RO'],
  [77000, 77999, 'TO'],
  [78000, 78899, 'MT'],
  [79000, 79999, 'MS'],
  [80000, 87999, 'PR'],
  [88000, 89999, 'SC'],
  [90000, 99999, 'RS'],
];

/** Só os dígitos, até 8. */
export function digitosCep(texto: string): string {
  return texto.replace(/\D/g, '').slice(0, 8);
}

/** "01310100" → "01310-100" enquanto digita. */
export function formatarCep(texto: string): string {
  const d = digitosCep(texto);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

/** Estado do CEP completo (8 dígitos); null se incompleto ou fora das faixas. */
export function estadoDoCep(texto: string): Uf | null {
  const d = digitosCep(texto);
  if (d.length !== 8) return null;
  const prefixo = Number(d.slice(0, 5));
  return FAIXAS.find(([de, ate]) => prefixo >= de && prefixo <= ate)?.[2] ?? null;
}
