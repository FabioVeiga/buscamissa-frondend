import { HttpClient } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { Observable } from "rxjs";

@Injectable({
  providedIn: "root",
})
export class RequestService {
  private http = inject(HttpClient);

  public getSubject(): Observable<any> {
    return this.http.get<any>("v1/Solicitacao/tipos");
  }

  public sendRequest(body: any): Observable<any> {
    return this.http.post<any>("v1/Solicitacao", body);
  }
}
