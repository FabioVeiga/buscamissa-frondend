/** Constantes compartilhadas entre CityComponent e suas seções (auditoria 2.x). */

export const PERIODOS: Record<string, { de: number; ate: number; label: string }> = {
  manha: { de: 5 * 60, ate: 11 * 60 + 59, label: "Manhã" },
  tarde: { de: 12 * 60, ate: 17 * 60 + 59, label: "Tarde" },
  noite: { de: 18 * 60, ate: 23 * 60 + 59, label: "Noite" },
};

export const DIAS: { label: string; slug: string; idx: number }[] = [
  { label: "Dom", slug: "domingo", idx: 0 },
  { label: "Seg", slug: "segunda", idx: 1 },
  { label: "Ter", slug: "terca", idx: 2 },
  { label: "Qua", slug: "quarta", idx: 3 },
  { label: "Qui", slug: "quinta", idx: 4 },
  { label: "Sex", slug: "sexta", idx: 5 },
  { label: "Sáb", slug: "sabado", idx: 6 },
];
