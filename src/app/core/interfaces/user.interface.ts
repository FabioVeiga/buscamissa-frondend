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

// ---- Auth do usuário público (fluxo Responsável Verificado) ----
// Espelha Dtos/AuthDtos.cs do api-public.

export interface SolicitarCodigoSenhaRequest {
  email: string;
  nome?: string;
}

export interface DefinirSenhaRequest {
  email: string;
  codigo: number;
  novaSenha: string;
}

export interface AuthResponse {
  id: number;
  nome: string;
  email: string;
  perfil: string;
  token: string;
  tokenExpira: string;
  refreshToken: string;
  refreshTokenExpira: string;
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