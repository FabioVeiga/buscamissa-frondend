export interface User {
  email: string;
  nome: string;
  senha: string;
  perfil: number;
  aceitarTermo: boolean;
  aceitarPromocao: boolean;
}

export interface AuthRequest {
  email: string;
  senha: string;
}

export interface ValidatorCodeRequest {
  email: string;
  nome: string;
  controleId: number;
  aceitarTermo: boolean;
  aceitarPromocao: boolean;
}

export interface FilterSearchUser {
  nome?: string;
  email?: string;
  "Paginacao.PageIndex": number;
  "Paginacao.PageSize": number;
}