import type { EventoFeed, TipoEvento } from '../api/tipos';
import { diaIso, hora, reais } from '../comum/formato';
import type { NomeIcone } from '../components/Icone';
import { Registro, type Fato } from '../components/Registro';
import { NOME_TIPO, assuntoDoEvento, fonteDaUrl, protocolo } from './rotulos';
import { resultadoDaVotacao } from '../propostas/resultado';

export function tipoDoEvento(evento: EventoFeed): string {
  return evento.tipo === 'voto_nominal' && /secret/i.test(String(evento.payload.voto ?? ''))
    ? 'Votação secreta'
    : NOME_TIPO[evento.tipo];
}

export interface RegistroDoEventoProps {
  evento: EventoFeed;
  novo?: boolean;
  aoTocar?: () => void;
}

/** Ícone do tipo de registro, ao lado do nome em caixa alta. */
export const ICONE_TIPO: Record<TipoEvento, NomeIcone> = {
  voto_nominal: 'check-square',
  voto_contra_orientacao: 'git-merge',
  pauta: 'calendar',
  tramitacao: 'file-text',
  mudanca_regime: 'zap',
  proposta_parada: 'clock',
  presenca: 'user-check',
  ausencia: 'user-x',
  despesa_mensal: 'credit-card',
  fundo_recebido: 'briefcase',
  repasse: 'repeat',
  doacao: 'gift',
  troca_partido: 'refresh-cw',
  situacao_candidatura: 'flag',
  resultado: 'award',
};

const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Sim/aprovado em verde, Não/rejeitado em vermelho; o resto neutro. */
function sentido(valor: string): Fato['sentido'] {
  if (/^(sim|aprovad[ao])$/i.test(valor)) return 'sim';
  if (/^(não|nao|rejeitad[ao])$/i.test(valor)) return 'nao';
  return 'neutro';
}

/** "Dep. federal · PL–AM", a partir do que a fonte informa no registro. */
export function metaDaPessoa(evento: EventoFeed): string | null {
  const p = evento.payload;
  const casa = texto(p.casa);
  const cargo = casa === 'camara' ? 'Dep. federal' : casa === 'senado' ? 'Senador(a)' : null;
  const partido = texto(p.partido);
  const uf = texto(p.uf);
  const filiacao = partido ? (uf ? `${partido}–${uf}` : partido) : null;
  return [cargo, filiacao].filter(Boolean).join(' · ') || null;
}

/** Voto, orientação da bancada, resultado ou valor do registro. */
export function fatosDoEvento(evento: EventoFeed): Fato[] {
  const p = evento.payload;
  const fatos: Fato[] = [];
  const voto = texto(p.voto);
  if (evento.tipo === 'voto_nominal' || evento.tipo === 'voto_contra_orientacao') {
    if (voto) fatos.push({ rotulo: 'Votou', valor: voto, sentido: sentido(voto) });
    const orientacao = p.orientacao as { bancada?: unknown; orientacao?: unknown } | null | undefined;
    const orientou = texto(orientacao?.orientacao);
    if (evento.tipo === 'voto_contra_orientacao' && orientou) {
      const bancada = texto(orientacao?.bancada) ?? 'Bancada';
      fatos.push({ rotulo: `${bancada} orientou`, valor: orientou, sentido: sentido(orientou) });
    } else if (typeof p.aprovada === 'boolean') {
      fatos.push({
        ...resultadoDaVotacao(p.aprovada, evento.resumo),
        sentido: p.aprovada ? 'sim' : 'nao',
        icone: p.aprovada ? 'check-circle' : 'x-circle',
      });
    }
    return fatos;
  }
  if (evento.valor !== null) fatos.push({ rotulo: 'Valor', valor: reais(evento.valor), sentido: 'neutro', icone: 'dollar-sign' });
  return fatos;
}

/** Um evento da API no formato de publicação do feed, sempre com a fonte. */
export function RegistroDoEvento({ evento, novo, aoTocar }: RegistroDoEventoProps) {
  const assunto = assuntoDoEvento(evento);
  const pessoa = evento.alvos.find((a) => a.tipo === 'pessoa');
  const proposta = evento.alvos.find((a) => a.tipo === 'proposicao');
  const projeto = texto(evento.payload.proposicao) ?? proposta?.nome ?? assunto;
  const fatos = fatosDoEvento(evento);
  return (
    <Registro
      tipo={[tipoDoEvento(evento), assunto].filter(Boolean).join(' · ')}
      etiqueta={tipoDoEvento(evento)}
      icone={ICONE_TIPO[evento.tipo]}
      projeto={projeto}
      hora={hora(evento.ocorridoEm)}
      manchete={evento.titulo}
      contexto={evento.resumo ?? undefined}
      pessoa={pessoa ? { nome: pessoa.nome, meta: metaDaPessoa(evento), foto: pessoa.foto ?? null } : null}
      fatos={fatos}
      fonte={{ ...fonteDaUrl(evento.fonte.url), data: diaIso(evento.fonte.dadoEm ?? evento.fonte.coletadoEm) }}
      protocolo={protocolo(evento)}
      coletadoEm={diaIso(evento.fonte.coletadoEm)}
      novo={novo}
      aoTocar={aoTocar}
    />
  );
}
