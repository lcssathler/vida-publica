/**
 * Horário de silêncio e "hoje" no fuso de cada usuário. Os fusos são os do
 * Brasil (sem horário de verão desde 2019), mas a conversão consulta o fuso
 * em cada instante e funciona com qualquer um.
 */

const formatos = new Map<string, Intl.DateTimeFormat>();

function formato(fuso: string): Intl.DateTimeFormat {
  let f = formatos.get(fuso);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: fuso,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatos.set(fuso, f);
  }
  return f;
}

interface Relogio {
  ano: number;
  mes: number;
  dia: number;
  /** Minutos desde a meia-noite local. */
  minutos: number;
  segundos: number;
}

/** Data e hora de parede no fuso. */
export function horaLocal(instante: Date, fuso: string): Relogio {
  const partes = Object.fromEntries(
    formato(fuso)
      .formatToParts(instante)
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  return {
    ano: Number(partes.year),
    mes: Number(partes.month),
    dia: Number(partes.day),
    minutos: Number(partes.hour) * 60 + Number(partes.minute),
    segundos: Number(partes.second),
  };
}

/** Diferença do fuso para UTC, em minutos, no instante (ex.: -180). */
function deslocamento(instante: Date, fuso: string): number {
  const l = horaLocal(instante, fuso);
  const comoUtc = Date.UTC(
    l.ano,
    l.mes - 1,
    l.dia,
    Math.floor(l.minutos / 60),
    l.minutos % 60,
    l.segundos,
  );
  const semMs = Math.floor(instante.getTime() / 1000) * 1000;
  return Math.round((comoUtc - semMs) / 60_000);
}

/** Instante da data e hora de parede no fuso (dia pode passar do mês). */
export function instanteLocal(
  ano: number,
  mes: number,
  dia: number,
  minutos: number,
  fuso: string,
): Date {
  const parede = Date.UTC(ano, mes - 1, dia, 0, minutos);
  let instante = parede - deslocamento(new Date(parede), fuso) * 60_000;
  // Segunda passada: o deslocamento pode ser outro no instante encontrado.
  instante = parede - deslocamento(new Date(instante), fuso) * 60_000;
  return new Date(instante);
}

/** "HH:MM" → minutos desde a meia-noite. */
export function paraMinutos(hora: string): number {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
}

export interface JanelaSilencio {
  silencioInicio: string;
  silencioFim: string;
  fuso: string;
}

/**
 * Se `agora` cai no horário de silêncio, o instante em que ele termina; se
 * não, null. Início igual ao fim desliga o silêncio; início depois do fim
 * atravessa a meia-noite (22:00–07:00). O fim não faz parte do silêncio.
 */
export function fimDoSilencio(
  janela: JanelaSilencio,
  agora: Date,
): Date | null {
  const inicio = paraMinutos(janela.silencioInicio);
  const fim = paraMinutos(janela.silencioFim);
  if (inicio === fim) return null;
  const l = horaLocal(agora, janela.fuso);
  const dentro =
    inicio < fim
      ? l.minutos >= inicio && l.minutos < fim
      : l.minutos >= inicio || l.minutos < fim;
  if (!dentro) return null;
  const dia = l.minutos < fim ? l.dia : l.dia + 1;
  return instanteLocal(l.ano, l.mes, dia, fim, janela.fuso);
}

/** Meia-noite de hoje no fuso: o teto diário conta a partir dela. */
export function inicioDoDia(agora: Date, fuso: string): Date {
  const l = horaLocal(agora, fuso);
  return instanteLocal(l.ano, l.mes, l.dia, 0, fuso);
}
