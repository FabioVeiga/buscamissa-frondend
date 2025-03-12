import { HttpClient, HttpParams } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { catchError, Observable, throwError } from "rxjs";
import {
  Church,
  FilterSearchChurch,
  ResponseAddress,
  UpdateChurch,
} from "../interfaces/church.interface";

@Injectable({
  providedIn: "root",
})
export class ChurchesService {
  private http = inject(HttpClient);

  /** Cria uma nova igreja */
  newChurch(church: Church) {
    return this.http.post(`Igreja`, church).pipe(catchError(this.handleError));
  }

  /** Atualiza os dados de uma igreja existente */
  updateChurch(church: UpdateChurch) {
    return this.http.put(`Igreja`, church).pipe(catchError(this.handleError));
  }

  /** Gera código para criar ou editar igreja */
  generateCode(body: any) {
    return this.http
      .post(`Usuario/gerar-codigo-validador`, body)
      .pipe(catchError(this.handleError));
  }

  /** Valida código da igreja */
  validateCode(body: any) {
    return this.http
      .post(`CodigoValidador/validar-igreja`, body)
      .pipe(catchError(this.handleError));
  }

  /** Busca igrejas próximas pelo CEP */
  searchByCEP(cep: string) {
    return this.http.get(`Igreja/buscar-por-cep?cep=${cep}`);
  }

  /** Busca cidades e bairros através da UF */
  addressRange(uf: string): Observable<ResponseAddress> {
    return this.http
      .get<ResponseAddress>(`Igreja/obter-enderecos?uf=${uf}`)
      .pipe(catchError(this.handleError));
  }

  /** Busca igrejas filtradas pelos parâmetros informados */
  searchByFilters(filters: FilterSearchChurch) {
    let params = new HttpParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        params = params.append(key, value.toString());
      }
    });
    return this.http
      .get(`Igreja/buscar-por-filtro`, { params })
      .pipe(catchError(this.handleError));
  }

  /** Busca atualizações de uma igreja específica */
  searchUpdates(churchId: number) {
    return this.http
      .get(`Igreja/buscar-por-atualizacoes/${churchId}`)
      .pipe(catchError(this.handleError));
  }

  /** Método para tratar erros */
  private handleError(error: any) {
    return throwError(
      () =>
        new Error(
          error.error?.data?.messagemAplicacao || "Ocorreu um erro inesperado."
        )
    );
  }
}
