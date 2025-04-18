// Interfaces para os serviços de Igreja.
export interface FilterSearchChurch {
  Uf: string;
  Localidade?: string;
  Bairro?: string;
  Nome?: string;
  Ativo?: boolean;
  DiaDaSemana?: number;
  Horario?: any;
  "Paginacao.PageIndex": number;
  "Paginacao.PageSize": number;
}

export interface Church {
  id?: number;
  nome: string;
  paroco: string;
  imagem?: string;
  missas: Mass[];
  endereco: Address;
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

