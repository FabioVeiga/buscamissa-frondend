import { Mass } from '../../core/interfaces/church.interface';
import { ConfidenceLevel, MassUrgency } from '../models/mass-card.model';

const DAY_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export function formatMassTime(horario: string): string {
  const [h, m] = horario.split(':').map(Number);
  return `${h.toString().padStart(2, '0')}h${m.toString().padStart(2, '0')}`;
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  const km = meters / 1000;
  return (
    km.toLocaleString('pt-BR', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }) + ' km'
  );
}

export function getNextOccurrenceMinutes(
  diaSemana: number,
  horario: string
): number {
  const now = new Date();
  const [h, m] = horario.split(':').map(Number);

  const target = new Date(now);
  target.setHours(h, m, 0, 0);

  const currentDay = now.getDay();
  let daysUntil = ((diaSemana - currentDay) + 7) % 7;

  // Mesma semana, horário já passou → próxima semana
  if (daysUntil === 0 && target <= now) {
    daysUntil = 7;
  }

  target.setDate(target.getDate() + daysUntil);
  return Math.round((target.getTime() - now.getTime()) / 60_000);
}

/** Nomes longos, como nos cards. Índice = `Date.getDay()` = `DiaDaSemanaEnum`. */
const DIAS_LONGOS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

/** Nomes por extenso, iguais ao `toLocaleDateString('pt-BR', { weekday: 'long' })`. */
const DIAS_POR_EXTENSO = [
  'domingo',
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sábado',
];

/**
 * Rótulo do dia da próxima ocorrência de uma missa.
 *
 * `relativo` é o que separa prerender de browser, e existe por um motivo concreto:
 * "Hoje" e "Amanhã" só têm sentido em relação a UM instante. O prerender assa
 * arquivo estático que fica no ar por 1 a 4 dias (não há rebuild agendado), então
 * um rótulo relativo gravado ali nasce com prazo de validade e envelhece calado.
 * Chegou a ser indexado assim: em 2026-09-09 o Google exibia, para uma paróquia de
 * Brasília, "Próxima missa 18h30 Terça, terça-feira, 8 de setembro" — a data do
 * build anterior, já vencida.
 *
 * - `relativo = false` (server/prerender): nome do dia. Invariante à data, sempre
 *   verdadeiro, e o Google indexa informação que não vence.
 * - `relativo = true` (browser, após hidratar): "Hoje"/"Amanhã" quando cabe.
 *
 * O chamador decide com `isPlatformBrowser`. O elemento no template é o MESMO nos
 * dois casos — só o texto muda —, então a hidratação apenas reescreve um nó de
 * texto, sem diferença estrutural de DOM.
 */
export function getDiaLabel(
  diaSemana: number,
  horario: string,
  relativo: boolean
): string {
  const nomeDoDia = DIAS_LONGOS[diaSemana] ?? '';
  if (!relativo) return nomeDoDia;

  const min = getNextOccurrenceMinutes(diaSemana, horario);
  const alvo = new Date(Date.now() + min * 60_000);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const dAlvo = new Date(alvo);
  dAlvo.setHours(0, 0, 0, 0);
  const diff = Math.round((dAlvo.getTime() - hoje.getTime()) / 86_400_000);

  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Amanhã';
  return nomeDoDia;
}

/**
 * Data da próxima ocorrência: "quinta-feira, 10 de setembro" no browser.
 *
 * No prerender devolve só o dia por extenso ("quinta-feira"). Uma missa semanal não
 * tem data absoluta estável — a data do próximo dia 10 depende de quando se
 * pergunta —, mas o DIA DA SEMANA nunca muda. É a informação estável equivalente.
 * Devolver texto (em vez de vazio) mantém o elemento com conteúdo e evita que ele
 * colapse antes da hidratação.
 */
export function getProximaMissaData(
  diaSemana: number,
  horario: string,
  relativo: boolean
): string {
  if (!relativo) return DIAS_POR_EXTENSO[diaSemana] ?? '';

  const min = getNextOccurrenceMinutes(diaSemana, horario);
  const data = new Date(Date.now() + min * 60_000);
  return data.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

export function getCountdownLabel(diaSemana: number, horario: string): string {
  const now = new Date();
  const [h, m] = horario.split(':').map(Number);
  const timeStr = m > 0 ? `${h}h${m.toString().padStart(2, '0')}` : `${h}h`;

  const target = new Date(now);
  target.setHours(h, m, 0, 0);

  const currentDay = now.getDay();
  let daysUntil = ((diaSemana - currentDay) + 7) % 7;
  if (daysUntil === 0 && target <= now) daysUntil = 7;
  target.setDate(target.getDate() + daysUntil);

  const minutes = Math.round((target.getTime() - now.getTime()) / 60_000);

  if (minutes <= 180) {
    if (minutes < 60) return `Começa em ${minutes} min`;
    const hrs = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0
      ? `Começa em ${hrs}h${mins.toString().padStart(2, '0')}`
      : `Começa em ${hrs}h`;
  }

  const todayMidnight = new Date(now);
  todayMidnight.setHours(0, 0, 0, 0);
  const targetMidnight = new Date(target);
  targetMidnight.setHours(0, 0, 0, 0);
  const dayDiff = Math.round(
    (targetMidnight.getTime() - todayMidnight.getTime()) / 86_400_000
  );

  if (dayDiff === 0) return `Hoje às ${timeStr}`;
  if (dayDiff === 1) return `Amanhã às ${timeStr}`;
  return `${DAY_NAMES[diaSemana]} às ${timeStr}`;
}

export function getConfidenceLevel(mass: Mass): ConfidenceLevel {
  if (mass.fontePrincipal === 1) return 'parish';

  if (mass.ultimaValidacao) {
    const lastValidation = new Date(mass.ultimaValidacao);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    if (lastValidation >= thirtyDaysAgo) return 'confirmed';
  }

  if (mass.statusConfianca !== undefined && mass.statusConfianca >= 2) {
    return 'confirmed';
  }

  return 'unverified';
}

export function getMissaAgoraUrgency(
  diaSemana: number,
  horario: string
): MassUrgency {
  const minutes = getNextOccurrenceMinutes(diaSemana, horario);
  if (minutes > 120) return null;
  if (minutes <= 30) return 'urgent';
  if (minutes <= 90) return 'soon';
  return 'later';
}
