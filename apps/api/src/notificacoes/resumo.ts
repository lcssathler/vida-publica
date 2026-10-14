import { TextoAviso } from './regras';

/** Total de um tipo de dinheiro na semana, só contagem e soma (nunca nomes). */
export interface TotalPorTipo {
  tipo: string;
  registros: number;
  /** Soma dos valores (R$); null quando o tipo não tem valor. */
  valor: number | null;
}

/** Nome de cada tipo no resumo, no singular e no plural. */
const NOMES: Record<string, [string, string]> = {
  despesa_mensal: ['mês de despesas da cota', 'meses de despesas da cota'],
  repasse: ['repasse de partido', 'repasses de partido'],
  doacao: ['dia de doações', 'dias de doações'],
  fundo_recebido: ['recebimento de fundo', 'recebimentos de fundo'],
};

/** Ordem fixa no texto. */
const ORDEM = ['despesa_mensal', 'repasse', 'doacao', 'fundo_recebido'];

function decimal(n: number): string {
  const arredondado = Math.round(n * 10) / 10;
  return Number.isInteger(arredondado)
    ? String(arredondado)
    : arredondado.toFixed(1).replace('.', ',');
}

/** R$ abreviado como no feed: R$ 950, R$ 23,4 mil, R$ 1,2 mi, R$ 3 bi. */
export function reaisCurto(valor: number): string {
  const abs = Math.abs(valor);
  if (abs >= 1e9) return `R$ ${decimal(valor / 1e9)} bi`;
  if (abs >= 1e6) return `R$ ${decimal(valor / 1e6)} mi`;
  if (abs >= 1e3) return `R$ ${decimal(valor / 1e3)} mil`;
  return `R$ ${Math.round(valor)}`;
}

function data(d: Date): string {
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export const LINK_DINHEIRO = 'vidapublica://feed?categorias=gastos,campanha';
export const LINK_FEED = 'vidapublica://feed';

export interface ConteudoResumo {
  totais: TotalPorTipo[];
  /** Avisos da semana que passaram do teto diário e ficaram para o resumo. */
  excedentes: number;
}

/**
 * Texto do resumo: factual, só contagens e somas por tipo, com o período.
 * `semana` é a segunda-feira (data local) da semana resumida. Devolve null
 * quando não há nada para resumir.
 */
export function textoDoResumo(
  semana: string,
  conteudo: ConteudoResumo,
): (TextoAviso & { url: string }) | null {
  const totais = ORDEM.map((tipo) =>
    conteudo.totais.find((t) => t.tipo === tipo && t.registros > 0),
  ).filter((t): t is TotalPorTipo => !!t);
  if (totais.length === 0 && conteudo.excedentes === 0) return null;
  const inicio = new Date(`${semana}T00:00:00Z`);
  const fim = new Date(inicio.getTime() + 6 * 86_400_000);
  const partes = totais.map((t) => {
    const [um, varios] = NOMES[t.tipo];
    const nome = `${t.registros} ${t.registros === 1 ? um : varios}`;
    return t.valor !== null ? `${nome} (${reaisCurto(t.valor)})` : nome;
  });
  const frases: string[] = [];
  frases.push(
    partes.length > 0
      ? `Dinheiro de quem você segue: ${partes.join('; ')}.`
      : 'Nenhum registro novo de dinheiro de quem você segue.',
  );
  if (conteudo.excedentes > 0) {
    frases.push(
      conteudo.excedentes === 1
        ? '1 aviso passou do seu teto diário e está no feed.'
        : `${conteudo.excedentes} avisos passaram do seu teto diário e estão no feed.`,
    );
  }
  frases.push('Toque para ver no feed.');
  return {
    titulo: `Resumo da semana de ${data(inicio)} a ${data(fim)}`,
    corpo: frases.join(' '),
    url: partes.length > 0 ? LINK_DINHEIRO : LINK_FEED,
  };
}
