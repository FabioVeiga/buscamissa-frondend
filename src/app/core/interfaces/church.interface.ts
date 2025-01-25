// Interfaces para os serviços de Igreja.
export interface FilterSearchChurch {
  Uf: string;
  Localidade?: string;
  Nome?: string;
  Ativo?: boolean;
  DiaDaSemana?: number;
  Horario?: string;
  "Paginacao.PageIndex": number;
  "Paginacao.PageSize": number;
}

export interface Church {
  nome: string;
  paroco: string;
  imagem: string;
  missas: Mass[];
  endereco: Address;
}

export interface UpdateChurch {
  id: number;
  paroco: string;
  imagemUrl: string;
  missas: Mass[];
}

export interface Mass {
  id: number;
  diaDaSemana: number;
  horario: string;
  observacao: string;
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
