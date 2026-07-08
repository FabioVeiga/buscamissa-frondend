import { HttpClient } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { Contribuidor } from "../interfaces/solicitacao.interface";

@Injectable({
  providedIn: "root",
})
export class ContributeService {
  private http = inject(HttpClient);

  public getContributors(): Observable<Contribuidor[]> {
    return this.http.get<Contribuidor[]>("v1/Contribuidor/do-mes-vigente");
  }
}
