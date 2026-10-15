import { HttpClient } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { Observable, of } from "rxjs";
import { catchError, map } from "rxjs/operators";

export type PosicaoAnuncio = "fim_resultados" | "home";

export interface CampanhaAtiva {
  id: number;
  /** "BuscaMissa" (campanha própria) ou "Patrocinado". */
  selo: string;
  titulo: string;
  textoCurto: string | null;
  imagemUrl: string;
  linkDestino: string;
  posicao: PosicaoAnuncio;
  /** campanhaId * 10 + posição: EntidadeId dos eventos de impressão/clique. */
  metricaId: number;
}

@Injectable({ providedIn: "root" })
export class CampanhaService {
  private http = inject(HttpClient);

  /** 204 (sem campanha) e qualquer falha resolvem em null: o site não mostra nada. */
  obterAtiva(posicao: PosicaoAnuncio): Observable<CampanhaAtiva | null> {
    return this.http
      .get<{ data: CampanhaAtiva } | null>("v1/Campanha/ativa", { params: { posicao } })
      .pipe(
        map((res) => res?.data ?? null),
        catchError(() => of(null)),
      );
  }
}
