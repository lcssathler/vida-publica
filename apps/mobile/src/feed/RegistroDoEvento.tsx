import type { EventoFeed } from '../api/tipos';
import { diaIso, hora } from '../comum/formato';
import { Registro } from '../components/Registro';
import { NOME_TIPO, assuntoDoEvento, fonteDaUrl, protocolo } from './rotulos';

export interface RegistroDoEventoProps {
  evento: EventoFeed;
  novo?: boolean;
  aoTocar?: () => void;
}

/** Um evento da API no formato de registro do "Protocolo", sempre com a fonte. */
export function RegistroDoEvento({ evento, novo, aoTocar }: RegistroDoEventoProps) {
  const assunto = assuntoDoEvento(evento);
  return (
    <Registro
      tipo={[NOME_TIPO[evento.tipo], assunto].filter(Boolean).join(' · ')}
      hora={hora(evento.ocorridoEm)}
      manchete={evento.titulo}
      contexto={evento.resumo ?? undefined}
      fonte={{ ...fonteDaUrl(evento.fonte.url), data: diaIso(evento.fonte.dadoEm ?? evento.fonte.coletadoEm) }}
      protocolo={protocolo(evento)}
      coletadoEm={diaIso(evento.fonte.coletadoEm)}
      novo={novo}
      aoTocar={aoTocar}
    />
  );
}
