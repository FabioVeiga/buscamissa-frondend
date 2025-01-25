import { HttpClient, HttpParams } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { catchError, throwError } from "rxjs";
import { AuthRequest, FilterSearchUser, User, ValidatorCodeRequest } from "../interfaces/user.interface";

@Injectable({
  providedIn: "root",
})
export class UsersService {
  private http = inject(HttpClient);

  /** Cria um novo usuário */
  createUser(user: User) {
    return this.http.post(`Usuario`, user).pipe(
      catchError(this.handleError)
    );
  }

  /** Autentica um usuário */
  authenticateUser(authRequest: AuthRequest) {
    return this.http.post(`Usuario/autenticar`, authRequest).pipe(
      catchError(this.handleError)
    );
  }

  /** Gera código validador para um usuário */
  generateValidatorCode(request: ValidatorCodeRequest) {
    return this.http.post(`Usuario/gerar-codigo-validador`, request).pipe(
      catchError(this.handleError)
    );
  }

  /** Busca um usuário pelo código */
  getUserByCode(codigo: number) {
    return this.http.get(`Usuario/${codigo}`).pipe(
      catchError(this.handleError)
    );
  }

  /** Busca usuários filtrados pelos parâmetros informados */
  searchByFilters(filters: FilterSearchUser) {
    const params = Object.entries(filters).reduce((httpParams, [key, value]) => {
      return value !== undefined && value !== null ? httpParams.set(key, value.toString()) : httpParams;
    }, new HttpParams());

    return this.http.get(`/api/Usuario/buscar-por-filtro`, { params }).pipe(
      catchError(this.handleError)
    );
  }

  /** Método para tratar erros */
  private handleError(error: any) {
    return throwError(() => new Error(error.error.data?.messagemAplicacao || "Ocorreu um erro inesperado."));
  }
}
