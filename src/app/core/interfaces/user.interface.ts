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

// Alternativa ao código por e-mail (FT auth-senha-sem-email) — espelha
// DesafioSenhaRequest/DefinirSenhaPorDesafioRequest do api-public.
export interface DesafioSenhaRequest {
  email: string;
  nome?: string;
}

export interface DefinirSenhaPorDesafioRequest {
  email: string;
  resposta: number;
  novaSenha: string;
  // Cadastro da pergunta de segurança pessoal no mesmo passo do bootstrap
  // (obrigatório para quem ainda não tem uma cadastrada).
  perguntaSegurancaId?: number;
  respostaSeguranca?: string;
}

// ---- Pergunta de segurança pessoal — espelha PerguntaSegurancaItem/
// PerguntaSegurancaRequest/DefinirSenhaPorPerguntaRequest do api-public.

export interface PerguntaSegurancaItem {
  id: number;
  texto: string;
}

export interface PerguntaSegurancaRequest {
  email: string;
}

export interface DefinirSenhaPorPerguntaRequest {
  email: string;
  resposta: string;
  novaSenha: string;
}

// ---- Conta (usuário logado) — espelha MinhaPerguntaSegurancaResponse/
// TrocarSenhaRequest/TrocarPerguntaSegurancaRequest do api-public.

export interface MinhaPerguntaSegurancaResponse {
  perguntaSegurancaId: number | null;
  pergunta: string | null;
}

export interface TrocarSenhaRequest {
  senhaAtual: string;
  novaSenha: string;
}

export interface TrocarPerguntaSegurancaRequest {
  senhaAtual: string;
  perguntaSegurancaId: number;
  resposta: string;
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