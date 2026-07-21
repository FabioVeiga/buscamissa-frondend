// Interfaces para os serviços de Igreja.
export interface FilterSearchChurch {
  Uf: string;
  Localidade?: string;
  Bairro?: string;
  Nome?: string;
  Ativo?: boolean;
  DiaDaSemana?: number;
  Horario?: string;
  HorarioFim?: string;
  "Paginacao.PageIndex": number;
  "Paginacao.PageSize": number;
}

export type StatusConfianca = 'Alta' | 'Media' | 'Baixa' | 'Desconhecida';

// Espelha Enums/TipoIgrejaEnum.cs do backend (int cru no banco — não renumerar).
export enum TipoIgreja {
  Paroquia = 1,
  Capela = 2,
  Comunidade = 3,
  Santuario = 4,
  Outro = 99,
}

export interface Church {
  id?: number;
  nomeUnico?: string;
  nome: string;
  paroco: string;
  imagem?: string;
  missas: Mass[];
  endereco: Address;
  statusConfianca?: StatusConfianca;
  /** Tipo da unidade (Paróquia, Capela...). Ausente em respostas antigas = Paróquia. */
  tipoIgreja?: TipoIgreja;
  /** Paróquia-sede quando esta unidade é capela/comunidade; null para paróquias. */
  igrejaPaiId?: number | null;
}

export interface UpdateChurch {
  id?: number | null;
  paroco: string;
  imagem: string;
  missas: Mass[];
  contato: {};
}

export interface Mass {
  id?: number;
  diaSemana?: number;
  horario: string;
  observacao?: string;
  // Confiança (preenchida pelo backend)
  fontePrincipal?: number;
  ultimaValidacao?: string | null;
  scoreConfianca?: number;
  statusConfianca?: number;
  nivelConfianca?: string;
  fonteLabel?: string;
  descricaoConfianca?: string;
}

export interface Address {
  cep: string;
  logradouro: string;
  complemento?: string;
  bairro: string;
  localidade: string;
  uf: string;
  estado: string;
  regiao: string;
}

export interface ResponseAddress {
  data: {
    localidades: string[];
    bairros: string[];
  };
}

