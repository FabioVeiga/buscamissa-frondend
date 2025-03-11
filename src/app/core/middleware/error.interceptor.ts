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
            errorMessage = Object.values(error.error.errors).flat().join("\n");
          } else if (error.error.data?.messagemAplicacao) {
            errorMessage = error.error.data.messagemAplicacao;
          }
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
