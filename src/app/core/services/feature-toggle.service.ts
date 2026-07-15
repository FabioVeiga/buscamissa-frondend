import { HttpClient } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { catchError, map, Observable, of, shareReplay } from "rxjs";

@Injectable({
  providedIn: "root",
})
export class FeatureToggleService {
  private http = inject(HttpClient);

  // Falha de rede não deve travar a feature: cai para {} e cada consumidor
  // decide o default (isEnabled retorna true quando a chave está ausente).
  private toggles$: Observable<Record<string, boolean>> = this.http
    .get<{ data: Record<string, boolean> }>("v1/FeatureToggle")
    .pipe(
      map((response) => response.data),
      catchError(() => of({} as Record<string, boolean>)),
      shareReplay(1)
    );

  isEnabled(chave: string): Observable<boolean> {
    return this.toggles$.pipe(
      map((toggles) => toggles[chave] ?? true)
    );
  }
}
