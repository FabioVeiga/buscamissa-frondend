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
