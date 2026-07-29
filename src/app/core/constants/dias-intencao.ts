/**
 * Dias da semana da árvore de INTENÇÃO (`/missa-{slug}`). Slugs idênticos aos das
 * rotas (`app.routes.ts`) e ao `DiaDaSemanaHelper` do backend. Usado pelos pontos
 * de entrada da Home. "hoje" não entra aqui (é redirect client-side pro dia local).
 */
export interface DiaIntencao {
  slug: string;
  nome: string;
}

export const DIAS_INTENCAO: DiaIntencao[] = [
  { slug: 'domingo', nome: 'Domingo' },
  { slug: 'segunda-feira', nome: 'Segunda-feira' },
  { slug: 'terca-feira', nome: 'Terça-feira' },
  { slug: 'quarta-feira', nome: 'Quarta-feira' },
  { slug: 'quinta-feira', nome: 'Quinta-feira' },
  { slug: 'sexta-feira', nome: 'Sexta-feira' },
  { slug: 'sabado', nome: 'Sábado' },
];
