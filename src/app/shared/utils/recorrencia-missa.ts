/**
 * Regra de recorrência de uma missa: semanal ("todo domingo"), dia fixo do mês
 * ("todo dia 13"), ocorrência no mês ("1ª e 3ª sexta-feira do mês") ou data específica
 * (25/12/2026, com nome e opção de substituir as missas normais do dia). Espelho de RecorrenciaMissa.cs (buscamissa-api-admin e
 * buscamissa-api-public) — mantenha as três implementações iguais.
 *
 * Calcula no relógio do navegador: o prerender fica no ar por dias e "hoje/amanhã"
 * depende do fuso de quem lê (o Brasil tem 4).
 */

export const TIPO_RECORRENCIA = {
  Semanal: 0,
  OcorrenciaNoMes: 1, // "1ª e 3ª sexta", "última terça"
  DiaDoMes: 2,
  DataEspecifica: 3, // 25/12/2026: só nessa data (com ano)
} as const;

/** Campos de `Mass` que definem quando a missa acontece. */
export interface RegraRecorrencia {
  diaSemana?: number | null;
  horario: string;
  tipoRecorrencia?: number | null;
  diaDoMes?: number | null;
  /** Bitmask dos dias em que a missa de dia fixo NÃO ocorre (bit0 = domingo … bit6 = sábado). */
  diasSemanaExcecao?: number | null;
  /** Bitmask das semanas na ocorrência no mês (bit0..bit4 = 1ª..5ª, bit5 = última). */
  semanasDoMes?: number | null;
  /** Só em data específica: "yyyy-MM-dd". */
  data?: string | null;
  /** Nome da missa (ex.: "Missa do Galo"); só em data específica. */
  nome?: string | null;
  /** Em data específica: as missas regulares da igreja nesse dia não acontecem. */
  substituiMissasDoDia?: boolean | null;
}

/** Bit de "última" em `semanasDoMes`. */
export const ULTIMA_SEMANA = 1 << 5;

/** Opções de semana do mês nos formulários (1ª a 4ª e "Última", decisão do produto). */
export const SEMANAS_DO_MES = [
  { bit: 1 << 0, label: '1ª' },
  { bit: 1 << 1, label: '2ª' },
  { bit: 1 << 2, label: '3ª' },
  { bit: 1 << 3, label: '4ª' },
  { bit: ULTIMA_SEMANA, label: 'Última' },
];

/**
 * Aviso (não bloqueia) quando há semanal e ocorrência no mês no mesmo dia e horário
 * ("toda sexta 19h" + "1ª sexta 19h"): costuma ser a mesma missa com intenção especial.
 * `horario` em "HH:mm". Mesmo texto do recorrenciaMissa.js do admin.
 */
export function alertaConflitoSemanal(missas: RegraRecorrencia[], nova: RegraRecorrencia): string | null {
  const tipoNovo = nova.tipoRecorrencia ?? TIPO_RECORRENCIA.Semanal;
  if (tipoNovo === TIPO_RECORRENCIA.DiaDoMes || tipoNovo === TIPO_RECORRENCIA.DataEspecifica || nova.diaSemana == null || !nova.horario) return null;
  const conflito = missas.find(
    (m) =>
      m.diaSemana === nova.diaSemana &&
      (m.horario ?? '').slice(0, 5) === nova.horario.slice(0, 5) &&
      (tipoNovo === TIPO_RECORRENCIA.OcorrenciaNoMes
        ? ehSemanal(m)
        : m.tipoRecorrencia === TIPO_RECORRENCIA.OcorrenciaNoMes)
  );
  if (!conflito) return null;
  const semanal = ehSemanal(conflito) ? conflito : nova;
  const dia = semanal.diaSemana ?? 0;
  const todo = dia === 0 || dia === 6 ? 'todo' : 'toda';
  return `Já existe missa ${todo} ${DIAS_NOME[dia]} às ${formatarHora(semanal.horario)}. Se for a mesma missa, use a observação.`;
}

/** Só os campos que dizem o TIPO da regra; dia/horário vêm à parte. */
export type TipoDaRegra = Pick<
  RegraRecorrencia,
  'tipoRecorrencia' | 'diaDoMes' | 'diasSemanaExcecao' | 'semanasDoMes' | 'data'
>;

const HORIZONTE_PADRAO_DIAS = 400;
const DIAS_ROTULO = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
const DIAS_NOME = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
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
    case TIPO_RECORRENCIA.OcorrenciaNoMes:
      // 1ª..5ª pela posição no mês (dia 1–7 = 1ª...); "última" quando não há outra depois.
      return (
        regra.semanasDoMes != null &&
        regra.diaSemana != null &&
        data.getDay() === regra.diaSemana &&
        (((regra.semanasDoMes & (1 << ordinalNoMes(data))) !== 0) ||
          ((regra.semanasDoMes & ULTIMA_SEMANA) !== 0 && ehUltimaDoMes(data)))
      );
    case TIPO_RECORRENCIA.DataEspecifica:
      return regra.data != null && chaveData(data) === regra.data.slice(0, 10);
    default:
      return false;
  }
}

/** "yyyy-MM-dd" do calendário local (a data da missa não tem fuso). */
export function chaveData(data: Date): string {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
}

export function ehDataEspecifica(regra: Pick<RegraRecorrencia, 'tipoRecorrencia'>): boolean {
  return regra.tipoRecorrencia === TIPO_RECORRENCIA.DataEspecifica;
}

/** Dias ("yyyy-MM-dd") em que uma missa especial desta igreja substitui as missas normais. */
export function datasSubstituidas(missas: RegraRecorrencia[] | null | undefined): ReadonlySet<string> {
  const datas = new Set<string>();
  for (const m of missas ?? []) {
    if (ehDataEspecifica(m) && m.substituiMissasDoDia && m.data) datas.add(m.data.slice(0, 10));
  }
  return datas;
}

/** "2026-12-25" → "25/12/2026". */
export function formatarData(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

/**
 * Próximo início estritamente depois de `agora` (missa começando exatamente agora já
 * conta como passada). Null se não ocorrer dentro do horizonte.
 */
export function proximaOcorrencia(
  regra: RegraRecorrencia,
  agora: Date = new Date(),
  horizonteDias = HORIZONTE_PADRAO_DIAS,
  substituidas?: ReadonlySet<string>
): Date | null {
  const [h, m] = (regra.horario ?? '').split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;

  const dia = new Date(agora);
  dia.setHours(0, 0, 0, 0);
  for (let i = 0; i <= horizonteDias; i++, dia.setDate(dia.getDate() + 1)) {
    if (!ocorreEm(regra, dia)) continue;
    // Dia com missa especial "substitui as normais": só a própria data específica conta.
    if (!ehDataEspecifica(regra) && substituidas?.has(chaveData(dia))) continue;
    const inicio = new Date(dia);
    inicio.setHours(h, m, 0, 0);
    if (inicio > agora) return inicio;
  }
  return null;
}

/** Ocorre daqui a `offsetDias` dias (0 = hoje, 1 = amanhã), pelo relógio local? */
export function ocorreNoDia(
  regra: RegraRecorrencia,
  offsetDias = 0,
  agora: Date = new Date(),
  substituidas?: ReadonlySet<string>
): boolean {
  const data = new Date(agora);
  data.setHours(0, 0, 0, 0);
  data.setDate(data.getDate() + offsetDias);
  if (!ehDataEspecifica(regra) && substituidas?.has(chaveData(data))) return false;
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

/** "Domingo, 19h" · "25/12/2026, 18h" · "Todo dia 13, 19h30" · "Todo dia 13, 19h (exceto sábados e domingos)". */
export function descrever(regra: RegraRecorrencia): string {
  const hora = formatarHora(regra.horario);
  switch (regra.tipoRecorrencia ?? TIPO_RECORRENCIA.Semanal) {
    case TIPO_RECORRENCIA.Semanal:
      return `${DIAS_ROTULO[regra.diaSemana ?? -1] ?? ''}, ${hora}`;
    case TIPO_RECORRENCIA.DiaDoMes:
      return `Todo dia ${regra.diaDoMes}, ${hora}${descreverExcecao(regra)}`;
    case TIPO_RECORRENCIA.OcorrenciaNoMes:
      return `${descreverSemanas(regra)} do mês, ${hora}`;
    case TIPO_RECORRENCIA.DataEspecifica:
      return `${formatarData(regra.data)}, ${hora}`;
    default:
      return hora;
  }
}

/**
 * Marca curta para a grade da semana, na data em que a missa cai: "dia 13" (dia fixo),
 * "2ª sexta do mês" / "último sábado do mês" (ocorrência no mês). Traz o dia porque
 * "2ª do mês" sozinho se lê como segunda-feira.
 */
export function rotuloNaData(regra: RegraRecorrencia, data: Date): string {
  if (ehDataEspecifica(regra)) return regra.nome || `dia ${data.getDate()}`;
  if ((regra.tipoRecorrencia ?? TIPO_RECORRENCIA.Semanal) !== TIPO_RECORRENCIA.OcorrenciaNoMes) return `dia ${data.getDate()}`;
  const masculino = regra.diaSemana === 0 || regra.diaSemana === 6;
  const dia = DIAS_NOME[data.getDay()].replace('-feira', '');
  const semanas = regra.semanasDoMes ?? 0;
  const ordinal = ordinalNoMes(data);
  if ((semanas & (1 << ordinal)) !== 0) return `${ordinal + 1}${masculino ? 'º' : 'ª'} ${dia} do mês`;
  return `${masculino ? 'último' : 'última'} ${dia} do mês`;
}

/** 0 = 1ª ocorrência do dia da semana no mês (dias 1–7), 1 = 2ª (8–14)... */
function ordinalNoMes(data: Date): number {
  return Math.floor((data.getDate() - 1) / 7);
}

function ehUltimaDoMes(data: Date): boolean {
  const diasNoMes = new Date(data.getFullYear(), data.getMonth() + 1, 0).getDate();
  return data.getDate() + 7 > diasNoMes;
}

// "1ª e 3ª sexta-feira" · "1º e último sábado" (sábado e domingo são masculinos).
function descreverSemanas(regra: RegraRecorrencia): string {
  const semanas = regra.semanasDoMes ?? 0;
  const masculino = regra.diaSemana === 0 || regra.diaSemana === 6;
  const ordinais = [0, 1, 2, 3, 4].filter((i) => (semanas & (1 << i)) !== 0).map((i) => `${i + 1}${masculino ? 'º' : 'ª'}`);
  if ((semanas & ULTIMA_SEMANA) !== 0) ordinais.push(masculino ? 'último' : 'última');
  const lista = ordinais.length <= 1 ? ordinais[0] ?? '' : `${ordinais.slice(0, -1).join(', ')} e ${ordinais[ordinais.length - 1]}`;
  const texto = `${lista} ${DIAS_NOME[regra.diaSemana ?? 0]}`;
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function ehExcecao(regra: RegraRecorrencia, diaDaSemana: number): boolean {
  return regra.diasSemanaExcecao != null && (regra.diasSemanaExcecao & (1 << diaDaSemana)) !== 0;
}

function descreverExcecao(regra: RegraRecorrencia): string {
  const mask = regra.diasSemanaExcecao;
  if (!mask) return '';
  // Semana a partir de segunda, para ler "sábados e domingos".
  const dias = [1, 2, 3, 4, 5, 6, 0].filter((d) => (mask & (1 << d)) !== 0).map((d) => DIAS_PLURAL[d]);
  const lista = dias.length === 1 ? dias[0] : `${dias.slice(0, -1).join(', ')} e ${dias[dias.length - 1]}`;
  return ` (exceto ${lista})`;
}

/** "19:00:00" → "19h" · "07:30" → "7h30". */
export function formatarHora(horario: string): string {
  const [h, m] = (horario ?? '').split(':').map(Number);
  if (Number.isNaN(h)) return horario ?? '';
  return !m ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
}
