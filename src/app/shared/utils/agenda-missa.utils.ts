import { RegraRecorrencia, TIPO_RECORRENCIA, ULTIMA_SEMANA, descrever, proximaOcorrencia } from './recorrencia-missa';

/**
 * "Adicionar à agenda": evento recorrente da missa para Google Agenda (link) e
 * para Apple/Outlook (arquivo .ics).
 *
 * Horário FLUTUANTE (sem fuso, sem "Z"): a agenda interpreta no fuso do aparelho.
 * É o certo aqui — "missa às 19h" é 19h onde a igreja está, e quem adiciona está,
 * na prática, no mesmo fuso. Converter para UTC erraria em quem está noutro dos
 * 4 fusos do Brasil por um motivo que a pessoa não entenderia.
 *
 * O dado não tem duração: assume 1h, a mesma suposição do schema.org da página.
 */

export interface EventoMissa {
  titulo: string;
  local: string;
  descricao: string;
  inicio: Date;
  fim: Date;
  /** Regra RFC 5545 sem o prefixo "RRULE:"; vazia = evento único. */
  rrule: string;
}

const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const DURACAO_MIN = 60;

/** Monta o evento da missa a partir da próxima ocorrência. Null se não houver próxima. */
export function eventoMissa(
  missa: RegraRecorrencia,
  nomeIgreja: string,
  endereco: string,
  urlPagina: string,
  agora: Date = new Date(),
): EventoMissa | null {
  const inicio = proximaOcorrencia(missa, agora);
  if (!inicio) return null;
  const fim = new Date(inicio.getTime() + DURACAO_MIN * 60_000);
  return {
    titulo: `Missa — ${nomeIgreja}`,
    local: endereco,
    descricao: `${descrever(missa)}. Confira se houve mudança de horário: ${urlPagina}`,
    inicio,
    fim,
    rrule: rruleDaMissa(missa),
  };
}

/** Regra de repetição equivalente à da missa ("toda semana", "todo dia 13", "1ª e 3ª sexta"). */
export function rruleDaMissa(missa: RegraRecorrencia): string {
  const dia = BYDAY[missa.diaSemana ?? -1];
  switch (missa.tipoRecorrencia ?? TIPO_RECORRENCIA.Semanal) {
    case TIPO_RECORRENCIA.Semanal:
      return dia ? `FREQ=WEEKLY;BYDAY=${dia}` : '';
    case TIPO_RECORRENCIA.DiaDoMes:
      return missa.diaDoMes ? `FREQ=MONTHLY;BYMONTHDAY=${missa.diaDoMes}` : '';
    case TIPO_RECORRENCIA.OcorrenciaNoMes: {
      if (!dia) return '';
      const semanas = missa.semanasDoMes ?? 0;
      const partes = [0, 1, 2, 3, 4].filter((i) => (semanas & (1 << i)) !== 0).map((i) => `${i + 1}${dia}`);
      if ((semanas & ULTIMA_SEMANA) !== 0) partes.push(`-1${dia}`);
      return partes.length ? `FREQ=MONTHLY;BYDAY=${partes.join(',')}` : '';
    }
    default:
      return '';
  }
}

/** 2026-11-08 07:00 local → "20261108T070000" (flutuante). */
export function dataAgenda(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}T${p(d.getHours())}${p(d.getMinutes())}00`;
}

/** Link "criar evento" do Google Agenda, já com a repetição. */
export function linkGoogleAgenda(ev: EventoMissa): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: ev.titulo,
    dates: `${dataAgenda(ev.inicio)}/${dataAgenda(ev.fim)}`,
    details: ev.descricao,
    location: ev.local,
  });
  if (ev.rrule) params.set('recur', `RRULE:${ev.rrule}`);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Escapa texto para .ics (RFC 5545 §3.3.11). */
function escIcs(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Conteúdo do arquivo .ics (Apple Calendário, Outlook e afins). */
export function conteudoIcs(ev: EventoMissa, uid: string, agora: Date = new Date()): string {
  const carimbo = agora.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const linhas = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//BuscaMissa//Agenda de missas//PT-BR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${carimbo}`,
    `DTSTART:${dataAgenda(ev.inicio)}`,
    `DTEND:${dataAgenda(ev.fim)}`,
    ...(ev.rrule ? [`RRULE:${ev.rrule}`] : []),
    `SUMMARY:${escIcs(ev.titulo)}`,
    `LOCATION:${escIcs(ev.local)}`,
    `DESCRIPTION:${escIcs(ev.descricao)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return linhas.join('\r\n') + '\r\n';
}
