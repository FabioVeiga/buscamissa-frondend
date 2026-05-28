import { HttpClient, HttpParams } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { Observable } from "rxjs";

@Injectable({
  providedIn: "root",
})
export class ChurchesService {
  private http = inject(HttpClient);

  /** Cria uma nova igreja */
  newChurch(church: any) {
    return this.http.post(`v1/Igreja`, church);
  }

  /** Atualiza os dados de uma igreja existente */
  updateChurch(church: any) {
    return this.http.put(`v1/Igreja`, church);
  }

  /** Gera código para criar ou editar igreja */
  generateCode(body: any) {
    return this.http.post(`v1/Usuario/gerar-codigo-validador`, body);
  }

  /** Valida código da igreja */
  validateCode(body: any) {
    return this.http.post(`v1/CodigoValidador/validar-igreja`, body);
  }

  /** Busca igrejas próximas pelo CEP */
  searchByCEP(cep: string) {
    return this.http.get(`v1/Igreja/buscar-por-cep?cep=${cep}`);
  }

  /** Busca cidades e bairros através da UF, Localidade e Bairro */
  public addressRange(): Observable<any> {
    return this.http.get<any>("v1/Igreja/v2/obter-enderecos");
  }

  /** Busca igrejas filtradas pelos parâmetros informados */
  searchByFilters(filters: any) {
    let params = new HttpParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        params = params.append(key, value.toString());
      }
    });
    return this.http.get(`v1/Igreja/buscar-por-filtro`, { params });
  }

  /** Busca atualizações de uma igreja específica */
  searchUpdates(churchId: number) {
    return this.http.get(`v1/Igreja/buscar-por-atualizacoes/${churchId}`);
  }

  report(churchId: number, body: any) {
    return this.http.post(`v1/Igreja/denunciar/${churchId}`, body);
  }

  getInfo() {
    return this.http.get(`v1/Igreja/infos`);
  }
}
