import { HttpClient } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { Observable } from "rxjs";
import {
  EnviarSolicitacaoResponse,
  TipoSolicitacao,
} from "../interfaces/solicitacao.interface";

@Injectable({
  providedIn: "root",
})
export class RequestService {
  private http = inject(HttpClient);

  public getSubject(): Observable<TipoSolicitacao[]> {
    return this.http.get<TipoSolicitacao[]>("v1/Solicitacao/tipos");
  }

  public sendRequest(body: unknown): Observable<EnviarSolicitacaoResponse> {
    return this.http.post<EnviarSolicitacaoResponse>("v1/Solicitacao", body);
  }
}
