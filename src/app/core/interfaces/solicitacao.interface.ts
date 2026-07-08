// Interfaces para os serviços de Solicitação e Contribuidores.

/** Tipo de solicitação exibido no dropdown de "Solicitar" (optionValue=id, optionLabel=nome). */
export interface TipoSolicitacao {
  id: number;
  nome: string;
}

/** Resposta do envio de uma solicitação. */
export interface EnviarSolicitacaoResponse {
  data: { numeroSolicitacao: string };
}

/** Contribuidor do mês vigente exibido na página de contribuintes. */
export interface Contribuidor {
  nome: string;
}
