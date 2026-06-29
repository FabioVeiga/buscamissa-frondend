import { HttpClient } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { Observable, shareReplay } from "rxjs";

export interface TipoRedeSocial {
  id: number;
  nome: string;
  urlBase: string;
  icone: string;
}

@Injectable({
  providedIn: "root",
})
export class RedesSociaisService {
  private http = inject(HttpClient);

  private tipos$: Observable<TipoRedeSocial[]> = this.http
    .get<TipoRedeSocial[]>("v1/RedeSocial/tipos")
    .pipe(shareReplay(1));

  obterTipos(): Observable<TipoRedeSocial[]> {
    return this.tipos$;
  }
}
