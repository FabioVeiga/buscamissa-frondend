// Agrupamento de horários de atendimento (secretaria/confissão) para exibição
// pública: em vez de uma linha por dia ("Ter — 08:00 às 11:30", "Qua — 08:00
// às 11:30", ...), junta dias consecutivos com o mesmo horário numa faixa
// ("Ter a Sex — 08:00 às 11:30").

export const DIAS_CURTOS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export interface SessaoComHorario {
  diaSemana: number;
  horarioInicio: string;
  horarioFim: string;
  observacao?: string | null;
}

export interface SessaoAgrupada {
  diasLabel: string;
  horarioInicio: string;
  horarioFim: string;
  observacao?: string | null;
}

export function agruparSessoesPorDiasConsecutivos(sessoes: SessaoComHorario[]): SessaoAgrupada[] {
  const grupos = new Map<string, SessaoComHorario[]>();
  for (const s of sessoes) {
    const chave = `${s.horarioInicio}|${s.horarioFim}|${s.observacao ?? ""}`;
    (grupos.get(chave) ?? grupos.set(chave, []).get(chave)!).push(s);
  }

  const resultado: (SessaoAgrupada & { primeiroDia: number })[] = [];
  for (const itens of grupos.values()) {
    const dias = [...new Set(itens.map((i) => i.diaSemana))].sort((a, b) => a - b);
    for (const faixa of agruparDiasConsecutivos(dias)) {
      resultado.push({
        diasLabel: labelFaixa(faixa),
        horarioInicio: itens[0].horarioInicio,
        horarioFim: itens[0].horarioFim,
        observacao: itens[0].observacao,
        primeiroDia: faixa[0],
      });
    }
  }

  return resultado
    .sort((a, b) => a.primeiroDia - b.primeiroDia || a.horarioInicio.localeCompare(b.horarioInicio))
    .map(({ primeiroDia, ...s }) => s);
}

// Dias já vêm ordenados (0=Domingo ... 6=Sábado); só colapsa sequências de
// inteiros consecutivos — não trata virada de semana (Sáb+Dom não vira faixa).
function agruparDiasConsecutivos(dias: number[]): number[][] {
  const faixas: number[][] = [];
  let atual: number[] = [];
  for (const dia of dias) {
    if (atual.length && dia === atual[atual.length - 1] + 1) {
      atual.push(dia);
    } else {
      if (atual.length) faixas.push(atual);
      atual = [dia];
    }
  }
  if (atual.length) faixas.push(atual);
  return faixas;
}

function labelFaixa(faixa: number[]): string {
  if (faixa.length === 1) return DIAS_CURTOS[faixa[0]];
  if (faixa.length === 2) return `${DIAS_CURTOS[faixa[0]]} e ${DIAS_CURTOS[faixa[1]]}`;
  return `${DIAS_CURTOS[faixa[0]]} a ${DIAS_CURTOS[faixa[faixa.length - 1]]}`;
}
