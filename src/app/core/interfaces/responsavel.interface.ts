// Contratos do fluxo Responsável Verificado — espelham Dtos/ResponsavelDtos.cs
// do api-public.

export interface SolicitarResponsabilidadeRequest {
  cargoInformado?: string;
  observacao?: string;
}

export type StatusResponsavel =
  | 'PendenteVerificacao'
  | 'Aprovado'
  | 'Revogado'
  | 'Rejeitado';

export interface MinhaResponsabilidade {
  id: number;
  igrejaId: number;
  igrejaNome: string;
  igrejaSlug?: string | null;
  papel: string;
  status: StatusResponsavel;
  dataSolicitacao: string;
  dataAprovacao?: string | null;
  motivoRevisao?: string | null;
  /** True quando o acesso veio por herança da paróquia-pai (não é vínculo direto). */
  porHeranca: boolean;
}
