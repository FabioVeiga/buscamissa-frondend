import { Mass } from '../../core/interfaces/church.interface';
import { formatMassTime } from './mass-time.utils';
import { datasSubstituidas, ehDataEspecifica, ehSemanal, proximaOcorrencia } from './recorrencia-missa';

/** Filtro de dia e horário da busca, como foi enviado à API. */
export interface FiltroMissa {
  dia: number | null;
  horarioDe: string | null;
  horarioAte: string | null;
}

export type EstadoProximaMissa = 'com-proxima' | 'sem-horarios' | 'sem-futura';

export interface ProximaMissaCard {
  missa: Mass | null;
  inicio: Date | null;
  outrosHorarios: string[];
  estado: EstadoProximaMissa;
  /** Até quando este resultado vale: o início da missa ou a próxima meia-noite local. */
  validoAte: Date;
}

const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const MAX_OUTROS_HORARIOS = 3;
const MINUTOS_CONTAGEM = 180;

function segundosDoDia(horario: string): number {
  const [h, m, s = 0] = (horario ?? '').split(':').map(Number);
  return h * 3600 + m * 60 + s;
}

/**
 * Missas que atendem ao filtro. Reproduz o predicado de BuscarPorFiltrosV1, em
 * buscamissa-api-public/Services/IgrejaReadService.cs: dia e horário valem para a
 * MESMA missa; com dia, só missa semanal (no dia fixo, `diaSemana` não tem significado);
 * sem fim, o horário é exato; fim sem início é ignorado. Se a regra mudar lá, mude aqui
 * (os testes daqui repetem os casos de BuscaPorFiltroV1Tests).
 */
export function filtrarMissasCompativeis(missas: Mass[], filtro: FiltroMissa | null): Mass[] {
  if (!filtro) return missas;
  const { dia } = filtro;
  const de = filtro.horarioDe ? segundosDoDia(filtro.horarioDe) : null;
  const ate = filtro.horarioAte ? segundosDoDia(filtro.horarioAte) : de;

  return missas.filter(m => {
    if (dia !== null && !(ehSemanal(m) && m.diaSemana === dia)) return false;
    // Missa de data específica não entra em filtro por horário (igual à API).
    if (de !== null && ehDataEspecifica(m)) return false;
    if (de === null) return true;
    const horario = segundosDoDia(m.horario);
    return horario >= de && horario <= ate!;
  });
}

function mesmaData(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function proximaMeiaNoite(agora: Date): Date {
  return new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + 1);
}

export function calcularProximaMissaCard(missas: Mass[], filtro: FiltroMissa | null, agora: Date): ProximaMissaCard {
  const meiaNoite = proximaMeiaNoite(agora);
  if (!missas.length) {
    return { missa: null, inicio: null, outrosHorarios: [], estado: 'sem-horarios', validoAte: meiaNoite };
  }

  const substituidas = datasSubstituidas(missas);
  const ocorrencias = filtrarMissasCompativeis(missas, filtro)
    .map(missa => ({ missa, inicio: proximaOcorrencia(missa, agora, undefined, substituidas) }))
    .filter((o): o is { missa: Mass; inicio: Date } => o.inicio !== null)
    .sort((a, b) => a.inicio.getTime() - b.inicio.getTime());

  const primeira = ocorrencias[0];
  if (!primeira) {
    return { missa: null, inicio: null, outrosHorarios: [], estado: 'sem-futura', validoAte: meiaNoite };
  }

  const horarioPrincipal = primeira.inicio.getTime();
  const outrosHorarios = [...new Set(
    ocorrencias
      .filter(o => mesmaData(o.inicio, primeira.inicio) && o.inicio.getTime() !== horarioPrincipal)
      .map(o => formatMassTime(o.missa.horario)),
  )];

  return {
    missa: primeira.missa,
    inicio: primeira.inicio,
    outrosHorarios,
    estado: 'com-proxima',
    validoAte: primeira.inicio < meiaNoite ? primeira.inicio : meiaNoite,
  };
}

/** "Hoje · Segunda", "Amanhã · Terça" ou "Sábado". O dia vem da data real da missa. */
export function rotuloDiaMissa(inicio: Date, agora: Date): string {
  const dia = DIAS[inicio.getDay()];
  if (mesmaData(inicio, agora)) return `Hoje · ${dia}`;
  if (mesmaData(inicio, proximaMeiaNoite(agora))) return `Amanhã · ${dia}`;
  return dia;
}

/** "14 de novembro"; o ano só aparece quando não é o atual. */
export function rotuloDataMissa(inicio: Date, agora: Date): string {
  return inicio.toLocaleDateString('pt-BR', {
    day: 'numeric',
    month: 'long',
    ...(inicio.getFullYear() !== agora.getFullYear() ? { year: 'numeric' as const } : {}),
  });
}

/** "18h00 e 20h00"; acima de três horários, "08h00, 10h00, 12h00 e mais 2". */
export function formatarOutrosHorarios(horarios: string[]): string {
  if (horarios.length > MAX_OUTROS_HORARIOS) {
    return `${horarios.slice(0, MAX_OUTROS_HORARIOS).join(', ')} e mais ${horarios.length - MAX_OUTROS_HORARIOS}`;
  }
  if (horarios.length < 2) return horarios[0] ?? '';
  return `${horarios.slice(0, -1).join(', ')} e ${horarios[horarios.length - 1]}`;
}

/** "Começa em 2h30" nas 3 horas anteriores à missa; vazio fora disso. */
export function rotuloContagem(inicio: Date, agora: Date): string {
  const minutos = Math.max(1, Math.round((inicio.getTime() - agora.getTime()) / 60_000));
  if (minutos > MINUTOS_CONTAGEM) return '';
  if (minutos < 60) return `Começa em ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto ? `Começa em ${horas}h${String(resto).padStart(2, '0')}` : `Começa em ${horas}h`;
}

/** Dias com missa semanal. No dia fixo, `diaSemana` não tem significado e não entra. */
export function diasSemanaisDeMissa(missas: Mass[]): number[] {
  const dias = missas.filter(m => ehSemanal(m) && m.diaSemana != null).map(m => m.diaSemana as number);
  return [...new Set(dias)].sort((a, b) => a - b);
}

/** Início, depois nome em pt-BR, depois id; sem próxima missa fica no fim. */
export function compararPorProximaMissa(
  a: { inicio: Date | null; nome?: string; id?: number },
  b: { inicio: Date | null; nome?: string; id?: number },
): number {
  const inicioA = a.inicio?.getTime() ?? Number.POSITIVE_INFINITY;
  const inicioB = b.inicio?.getTime() ?? Number.POSITIVE_INFINITY;
  if (inicioA !== inicioB) return inicioA < inicioB ? -1 : 1;
  return (a.nome ?? '').localeCompare(b.nome ?? '', 'pt-BR') || (a.id ?? 0) - (b.id ?? 0);
}
