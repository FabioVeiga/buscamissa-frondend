import { HttpClient } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { BehaviorSubject, Observable, map, tap } from "rxjs";
import {
  AuthResponse,
  DefinirSenhaRequest,
  SolicitarCodigoSenhaRequest,
} from "../interfaces/user.interface";

const STORAGE_KEY = "bm_sessao";

/**
 * Sessão do usuário público (fluxo Responsável Verificado).
 * Login com senha + refresh token emitidos pelo api-public (api/v1/auth).
 * O token de sessão convive com o token estático de app: o AuthInterceptor
 * usa o de sessão quando válido e cai para o estático nas chamadas anônimas.
 */
@Injectable({ providedIn: "root" })
export class AuthService {
  private http = inject(HttpClient);

  private sessaoSubject = new BehaviorSubject<AuthResponse | null>(this.carregarSessao());
  /** Sessão atual (null = anônimo). */
  readonly sessao$ = this.sessaoSubject.asObservable();

  get sessao(): AuthResponse | null {
    return this.sessaoSubject.value;
  }

  get estaLogado(): boolean {
    return this.tokenValido(this.sessao);
  }

  /** Token de acesso válido (não expirado), ou null. */
  get accessToken(): string | null {
    const sessao = this.sessao;
    return this.tokenValido(sessao) ? sessao!.token : null;
  }

  /** Serve para cadastro de senha E "esqueci minha senha". */
  solicitarCodigoSenha(request: SolicitarCodigoSenhaRequest): Observable<string> {
    return this.http
      .post<{ data: { mensagemTela: string } }>("v1/auth/solicitar-codigo-senha", request)
      .pipe(map((r) => r.data.mensagemTela));
  }

  definirSenha(request: DefinirSenhaRequest): Observable<string> {
    return this.http
      .post<{ data: { mensagemTela: string } }>("v1/auth/definir-senha", request)
      .pipe(map((r) => r.data.mensagemTela));
  }

  login(email: string, senha: string): Observable<AuthResponse> {
    return this.http
      .post<{ data: AuthResponse }>("v1/auth/login", { email, senha })
      .pipe(
        map((r) => r.data),
        tap((sessao) => this.salvarSessao(sessao))
      );
  }

  /** Rotaciona o refresh token; sessão cai se o backend rejeitar. */
  refresh(): Observable<AuthResponse> {
    const refreshToken = this.sessao?.refreshToken;
    return this.http
      .post<{ data: AuthResponse }>("v1/auth/refresh", { refreshToken })
      .pipe(
        map((r) => r.data),
        tap({
          next: (sessao) => this.salvarSessao(sessao),
          error: () => this.logout(),
        })
      );
  }

  logout(): void {
    localStorage.removeItem(STORAGE_KEY);
    this.sessaoSubject.next(null);
  }

  /** Restaura a sessão ao abrir o app: renova se o access token venceu mas o refresh ainda vale. */
  restaurarSessao(): void {
    const sessao = this.sessao;
    if (!sessao) return;
    if (this.tokenValido(sessao)) return;
    if (new Date(sessao.refreshTokenExpira) > new Date()) {
      this.refresh().subscribe({ error: () => {} });
    } else {
      this.logout();
    }
  }

  private tokenValido(sessao: AuthResponse | null): boolean {
    if (!sessao?.token) return false;
    // 30s de folga para não usar token à beira de expirar
    return new Date(sessao.tokenExpira).getTime() - 30_000 > Date.now();
  }

  private salvarSessao(sessao: AuthResponse): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessao));
    this.sessaoSubject.next(sessao);
  }

  private carregarSessao(): AuthResponse | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as AuthResponse) : null;
    } catch {
      return null;
    }
  }
}
