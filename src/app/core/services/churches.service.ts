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
  newChurch(church: any) {
    return this.http.post(`Igreja`, church);
  }

  /** Atualiza os dados de uma igreja existente */
  updateChurch(church: any) {
    return this.http.put(`Igreja`, church);
  }

  /** Gera código para criar ou editar igreja */
  generateCode(body: any) {
    return this.http.post(`Usuario/gerar-codigo-validador`, body);
  }

  /** Valida código da igreja */
  validateCode(body: any) {
    return this.http.post(`CodigoValidador/validar-igreja`, body);
  }

  /** Busca igrejas próximas pelo CEP */
  searchByCEP(cep: string) {
    return this.http.get(`Igreja/buscar-por-cep?cep=${cep}`);
  }

  /** Busca cidades e bairros através da UF, Localidade e Bairro */
  public addressRange(
    uf: string,
    localidade?: string,
    bairro?: string
  ): Observable<any> {
    let params = new HttpParams().set("uf", uf);
    if (localidade) params = params.set("localidade", localidade);
    if (bairro) params = params.set("bairro", bairro);
    return this.http.get<any>("Igreja/obter-enderecos", { params });
  }

  /** Busca igrejas filtradas pelos parâmetros informados */
  searchByFilters(filters: any) {
    let params = new HttpParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        params = params.append(key, value.toString());
      }
    });
    return this.http.get(`Igreja/buscar-por-filtro`, { params });
  }

  /** Busca atualizações de uma igreja específica */
  searchUpdates(churchId: number) {
    return this.http.get(`Igreja/buscar-por-atualizacoes/${churchId}`);
  }

  report(churchId: number, body: any) {
    return this.http.post(`Igreja/denunciar/${churchId}`, body);
  }

  getInfo() {
    return this.http.get(`Igreja/infos`);
  }
}
