import { HttpClient } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { map, Observable, tap } from "rxjs";
import { BehaviorSubject } from "rxjs";
import { NotificacaoParaResponsavel } from "../interfaces/notificacao.interface";

/**
 * Notificações do admin lidas pelo responsável (api/v1/responsavel/notificacoes).
 * Mantém a lista mais recente em memória para alimentar o badge no header
 * sem precisar de outra chamada.
 */
@Injectable({ providedIn: "root" })
export class NotificacaoService {
  private http = inject(HttpClient);

  private notificacoesSubject = new BehaviorSubject<NotificacaoParaResponsavel[]>([]);
  readonly notificacoes$ = this.notificacoesSubject.asObservable();

  get naoLidas(): number {
    return this.notificacoesSubject.value.filter((n) => !n.lida).length;
  }

  listar(): Observable<NotificacaoParaResponsavel[]> {
    return this.http
      .get<{ data: NotificacaoParaResponsavel[] }>("v1/responsavel/notificacoes")
      .pipe(
        map((r) => r.data),
        tap((lista) => this.notificacoesSubject.next(lista))
      );
  }

  marcarComoLida(destinoId: number): Observable<string> {
    return this.http
      .post<{ data: { mensagemTela: string } }>(`v1/responsavel/notificacoes/${destinoId}/marcar-lida`, {})
      .pipe(
        map((r) => r.data.mensagemTela),
        tap(() => {
          const atual = this.notificacoesSubject.value.map((n) =>
            n.destinoId === destinoId ? { ...n, lida: true } : n
          );
          this.notificacoesSubject.next(atual);
        })
      );
  }
}
