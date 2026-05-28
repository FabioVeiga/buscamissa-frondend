import { HttpClient } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { Observable } from "rxjs";

@Injectable({
  providedIn: "root",
})
export class ContributeService {
  private http = inject(HttpClient);

  public getContributors(): Observable<any> {
    return this.http.get<any>("v1/Contribuidor/do-mes-vigente");
  }
}
