import { HttpClient, HttpParams } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { catchError, throwError } from "rxjs";
import { Church, FilterSearchChurch, UpdateChurch } from "../interfaces/church.interface";

@Injectable({
  providedIn: "root",
})

export class ChurchesService {
  private http = inject(HttpClient);

  /** Cria uma nova igreja */
  newChurch(church: Church) {
    return this.http.post(`Igreja`, church).pipe(
      catchError(this.handleError)
    );
  }

  /** Atualiza os dados de uma igreja existente */
  updateChurch(church: UpdateChurch) {
    return this.http.put(`Igreja/${church.id}`, church).pipe(
      catchError(this.handleError)
    );
  }

  /** Busca igrejas próximas pelo CEP */
  searchByCEP(cep: string) {
    return this.http.get(`Igreja/buscar-por-cep?cep=${cep}`).pipe(
      catchError(this.handleError)
    );
  }

  /** Busca igrejas filtradas pelos parâmetros informados */
  searchByFilters(filters: FilterSearchChurch) {
    const params = Object.entries(filters).reduce((httpParams, [key, value]) => {
      return value !== undefined && value !== null ? httpParams.set(key, value.toString()) : httpParams;
    }, new HttpParams());

    return this.http.get(`Igreja/buscar-por-filtro`, { params }).pipe(
      catchError(this.handleError)
    );
  }

  /** Busca atualizações de uma igreja específica */
  searchUpdates(churchId: number) {
    return this.http.get(`Igreja/buscar-por-atualizacoes/${churchId}`).pipe(
      catchError(this.handleError)
    );
  }

  /** Método para tratar erros */
  private handleError(error: any) {
    return throwError(() => new Error(error.error.data?.messagemAplicacao || "Ocorreu um erro inesperado."));
  }
}