/**
 * O que vira aviso e como o texto é montado.
 *
 * Push só quando é acionável ou datado (referência técnica): votos, pauta,
 * etapas de proposta, ausência e campanha. Dinheiro e despesas (despesa_mensal,
 * repasse, doacao, fundo_recebido) vão para o resumo semanal; presença em
 * sessão e proposta parada ficam só no feed.
 */
export const TIPOS_AVISO = [
  'voto_nominal',
  'voto_contra_orientacao',
  'pauta',
  'tramitacao',
  'mudanca_regime',
  'ausencia',
  'troca_partido',
  'situacao_candidatura',
  'resultado',
] as const;

export const TIPOS_RESUMO = [
  'despesa_mensal',
  'repasse',
  'doacao',
  'fundo_recebido',
] as const;

export const ESQUEMA_APP = 'vidapublica';

/** Link que abre o registro com a fonte no app. */
export function linkDoEvento(eventoId: string): string {
  return `${ESQUEMA_APP}://evento/${eventoId}`;
}

const LIMITE_TITULO = 110;
const LIMITE_RESUMO = 150;
const CHAMADA = 'Toque para ver a fonte.';

/** Corta no limite, na última palavra inteira, com reticências. */
export function cortar(texto: string, limite: number): string {
  const limpo = texto.replace(/\s+/g, ' ').trim();
  if (limpo.length <= limite) return limpo;
  const corte = limpo.slice(0, limite - 1);
  const espaco = corte.lastIndexOf(' ');
  const base = espaco > limite / 2 ? corte.slice(0, espaco) : corte;
  return `${base.replace(/[\s,;:.—-]+$/, '')}…`;
}

export interface TextoAviso {
  titulo: string;
  corpo: string;
}

/**
 * Texto do aviso: o título factual do evento (o mesmo do feed, gerado pelo
 * motor sem adjetivos) e o resumo, seguidos da chamada para a fonte.
 */
export function textoDoAviso(evento: {
  titulo: string;
  resumo: string | null;
}): TextoAviso {
  const resumo = evento.resumo?.trim();
  return {
    titulo: cortar(evento.titulo, LIMITE_TITULO),
    corpo: resumo ? `${cortar(resumo, LIMITE_RESUMO)} ${CHAMADA}` : CHAMADA,
  };
}

/** CPF formatado ou 11 dígitos seguidos. */
const PARECE_CPF = /\d{3}\.\d{3}\.\d{3}-\d{2}|(?<!\d)\d{11}(?!\d)/;

/**
 * Última barreira antes do envio: o motor nunca põe CPF em título ou resumo,
 * mas um aviso com algo parecido com CPF não sai.
 */
export function textoSeguro(texto: TextoAviso): boolean {
  return !PARECE_CPF.test(texto.titulo) && !PARECE_CPF.test(texto.corpo);
}
