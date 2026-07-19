// Contratos de leitura de notificações pelo responsável — espelham
// Dtos/NotificacaoDtos.cs do api-public.

export interface NotificacaoParaResponsavel {
  /** Id do NotificacaoDestino — usado para marcar como lida. */
  destinoId: number;
  titulo: string;
  mensagem: string;
  tipo: 'Geral' | 'Aviso' | 'Urgente';
  criadaPor: string;
  criadaEm: string;
  igrejaId: number;
  igrejaNome: string;
  lida: boolean;
}
