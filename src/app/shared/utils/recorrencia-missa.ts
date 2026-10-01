/**
 * Regra de recorrência de uma missa: semanal ("todo domingo") ou dia fixo do mês
 * ("todo dia 13"). Espelho de RecorrenciaMissa.cs (buscamissa-api-admin e
 * buscamissa-api-public) — mantenha as três implementações iguais.
 *
 * Calcula no relógio do navegador: o prerender fica no ar por dias e "hoje/amanhã"
 * depende do fuso de quem lê (o Brasil tem 4).
 */

export const TIPO_RECORRENCIA = {
  Semanal: 0,
  OcorrenciaNoMes: 1, // reservado ("1ª sexta"), ainda não suportado
  DiaDoMes: 2,
} as const;

/** Campos de `Mass` que definem quando a missa acontece. */
export interface RegraRecorrencia {
  diaSemana?: number | null;
  horario: string;
  tipoRecorrencia?: number | null;
  diaDoMes?: number | null;
  /** Bitmask dos dias em que a missa de dia fixo NÃO ocorre (bit0 = domingo … bit6 = sábado). */
  diasSemanaExcecao?: number | null;
}

/** Só os campos que dizem o TIPO da regra; dia/horário vêm à parte. */
export type TipoDaRegra = Pick<RegraRecorrencia, 'tipoRecorrencia' | 'diaDoMes' | 'diasSemanaExcecao'>;

const HORIZONTE_PADRAO_DIAS = 400;
const DIAS_ROTULO = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
const DIAS_PLURAL = ['domingos', 'segundas-feiras', 'terças-feiras', 'quartas-feiras', 'quintas-feiras', 'sextas-feiras', 'sábados'];

/** Ausência do campo (cliente/API antigos, favorito salvo antes) = semanal. */
export function ehSemanal(regra: Pick<RegraRecorrencia, 'tipoRecorrencia'>): boolean {
  return (regra.tipoRecorrencia ?? TIPO_RECORRENCIA.Semanal) === TIPO_RECORRENCIA.Semanal;
}

/** A missa acontece nesta data (sem olhar o horário)? */
export function ocorreEm(regra: RegraRecorrencia, data: Date): boolean {
  switch (regra.tipoRecorrencia ?? TIPO_RECORRENCIA.Semanal) {
    case TIPO_RECORRENCIA.Semanal:
      return regra.diaSemana != null && data.getDay() === regra.diaSemana;
    case TIPO_RECORRENCIA.DiaDoMes:
      // Dia 29–31 em mês que não tem o dia nunca casa: a missa não ocorre naquele mês.
      return regra.diaDoMes != null && data.getDate() === regra.diaDoMes && !ehExcecao(regra, data.getDay());
    default:
      return false;
  }
}

/**
 * Próximo início estritamente depois de `agora` (missa começando exatamente agora já
 * conta como passada). Null se não ocorrer dentro do horizonte.
 */
export function proximaOcorrencia(
  regra: RegraRecorrencia,
  agora: Date = new Date(),
  horizonteDias = HORIZONTE_PADRAO_DIAS
): Date | null {
  const [h, m] = (regra.horario ?? '').split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;

  const dia = new Date(agora);
  dia.setHours(0, 0, 0, 0);
  for (let i = 0; i <= horizonteDias; i++, dia.setDate(dia.getDate() + 1)) {
    if (!ocorreEm(regra, dia)) continue;
    const inicio = new Date(dia);
    inicio.setHours(h, m, 0, 0);
    if (inicio > agora) return inicio;
  }
  return null;
}

/** Ocorre daqui a `offsetDias` dias (0 = hoje, 1 = amanhã), pelo relógio local? */
export function ocorreNoDia(regra: RegraRecorrencia, offsetDias = 0, agora: Date = new Date()): boolean {
  const data = new Date(agora);
  data.setHours(0, 0, 0, 0);
  data.setDate(data.getDate() + offsetDias);
  return ocorreEm(regra, data);
}

/**
 * Ocorre no fim de semana que vem (ou no atual, se hoje é sábado/domingo)? Para
 * semanal é só "sábado ou domingo"; para dia fixo depende da data desse fim de semana.
 */
export function ocorreNoFimDeSemana(regra: RegraRecorrencia, agora: Date = new Date()): boolean {
  if (ehSemanal(regra)) return regra.diaSemana === 0 || regra.diaSemana === 6;
  const dow = agora.getDay();
  const ateSabado = dow === 0 ? -1 : 6 - dow;
  return ocorreNoDia(regra, ateSabado, agora) || ocorreNoDia(regra, ateSabado + 1, agora);
}

/** "Domingo, 19h" · "Todo dia 13, 19h30" · "Todo dia 13, 19h (exceto sábados e domingos)". */
export function descrever(regra: RegraRecorrencia): string {
  const hora = formatarHora(regra.horario);
  switch (regra.tipoRecorrencia ?? TIPO_RECORRENCIA.Semanal) {
    case TIPO_RECORRENCIA.Semanal:
      return `${DIAS_ROTULO[regra.diaSemana ?? -1] ?? ''}, ${hora}`;
    case TIPO_RECORRENCIA.DiaDoMes:
      return `Todo dia ${regra.diaDoMes}, ${hora}${descreverExcecao(regra)}`;
    default:
      return hora;
  }
}

function ehExcecao(regra: RegraRecorrencia, diaDaSemana: number): boolean {
  return regra.diasSemanaExcecao != null && (regra.diasSemanaExcecao & (1 << diaDaSemana)) !== 0;
}

function descreverExcecao(regra: RegraRecorrencia): string {
  const mask = regra.diasSemanaExcecao;
  if (!mask) return '';
  // Exceção em 4+ dias: mais claro dizer quando OCORRE ("somente sábados e domingos").
  const excluidos = [0, 1, 2, 3, 4, 5, 6].filter((d) => (mask & (1 << d)) !== 0).length;
  const somente = excluidos >= 4;
  // Semana a partir de segunda, para ler "sábados e domingos".
  const dias = [1, 2, 3, 4, 5, 6, 0]
    .filter((d) => ((mask & (1 << d)) !== 0) !== somente)
    .map((d) => DIAS_PLURAL[d]);
  const lista = dias.length === 1 ? dias[0] : `${dias.slice(0, -1).join(', ')} e ${dias[dias.length - 1]}`;
  return somente ? ` (somente ${lista})` : ` (exceto ${lista})`;
}

function formatarHora(horario: string): string {
  const [h, m] = (horario ?? '').split(':').map(Number);
  if (Number.isNaN(h)) return horario ?? '';
  return !m ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
}
