const FUSO = 'America/Sao_Paulo';

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const inteiro = new Intl.NumberFormat('pt-BR');
const dataHora = new Intl.DateTimeFormat('pt-BR', {
  timeZone: FUSO,
  dateStyle: 'short',
  timeStyle: 'short',
});
const soData = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, dateStyle: 'short' });

export function dinheiro(valor: number | null | undefined): string {
  return valor === null || valor === undefined ? '—' : moeda.format(valor);
}

export function numero(valor: number): string {
  return inteiro.format(valor);
}

/** Data e hora de Brasília; meia-noite em Brasília (fato só com data) sai sem hora. */
export function quando(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const hora = new Intl.DateTimeFormat('pt-BR', {
    timeZone: FUSO,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(d);
  return hora === '00:00' ? soData.format(d) : dataHora.format(d);
}

export const ROTULO_MOTIVO: Record<string, string> = {
  revisao_valor: 'Dinheiro acima de R$ 500 mil',
  carga_inicial: 'Carga inicial ou regra nova',
  fonte_removeu: 'A fonte removeu',
  regra_substituida: 'Regra substituída',
  admin: 'Arquivado no painel',
};

export const ROTULO_REPORTE: Record<string, string> = {
  fato_errado: 'Fato errado',
  pessoa_errada: 'Pessoa errada',
  valor_errado: 'Valor errado',
  fonte_quebrada: 'Fonte não abre',
  outro: 'Outro',
};

export const ROTULO_CASAMENTO: Record<string, string> = {
  sem_data_nascimento: 'Fonte sem data de nascimento',
  sem_candidatura_compativel: 'Nenhuma candidatura compatível',
  homonimos_mesma_data: 'Homônimos com a mesma data',
  varios_candidatos_mesma_data_uf: 'Vários candidatos com a mesma data e UF',
};

export const ROTULO_RECUSA: Record<string, string> = {
  nao_encontrado: 'não encontrado',
  mudou: 'mudou depois que você abriu a página (abra de novo)',
  nao_segurado: 'não está mais segurado',
  sem_fonte: 'sem fonte: não publica',
  ja_arquivado: 'já estava arquivado',
};
