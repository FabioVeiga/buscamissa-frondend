import { inject, Injectable } from "@angular/core";
import {
  HttpEvent,
  HttpInterceptor,
  HttpHandler,
  HttpRequest,
  HttpErrorResponse,
} from "@angular/common/http";
import { Observable, throwError } from "rxjs";
import { catchError } from "rxjs/operators";
import { MatSnackBar } from "@angular/material/snack-bar";

@Injectable()
export class ErrorInterceptor implements HttpInterceptor {
  private _snackbar = inject(MatSnackBar);

  intercept(
    req: HttpRequest<any>,
    next: HttpHandler
  ): Observable<HttpEvent<any>> {
    return next.handle(req).pipe(
      catchError((error: HttpErrorResponse) => {
        let errorMessage = "Ocorreu um erro desconhecido!";

        if (error.error) {
          if (error.error.errors) {
            // Captura mensagens de erro de validação
            errorMessage = Object.values(error.error.errors).flat().join("\n");
          } else if (error.error.data?.messagemAplicacao) {
            errorMessage = error.error.data.messagemAplicacao;
          }
        }

        // Tratamento para erros comuns
        if (error.status === 404) {
          errorMessage = "Recurso não encontrado!";
        } else if (error.status === 500) {
          errorMessage = "Erro interno do servidor!";
        }

        this._snackbar.open(errorMessage, "OK", {
          duration: 5000,
          panelClass: "error-snackbar",
        });

        return throwError(() => new Error(errorMessage));
      })
    );
  }
}
