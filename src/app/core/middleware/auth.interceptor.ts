import { Injectable, inject } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../services/auth.service';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  private authService = inject(AuthService);

  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    // O JWT do usuário logado só tem papel Regular/Dono — só serve nas rotas
    // do Responsável Verificado (api/v1/responsavel). Todo o resto do backend
    // (busca de igreja, cadastro colaborativo etc.) exige role App/Admin, que
    // só o token estático de config carrega. Usar o token de sessão fora de
    // v1/responsavel derruba essas chamadas com 403 mesmo estando logado.
    // req.url ainda é relativo aqui (AuthInterceptor roda antes do
    // ApiBaseUrlInterceptor, que só então prefixa a apiURL) — sem barra inicial.
    const ehRotaDoResponsavel = req.url.includes('v1/responsavel/') || req.url.includes('v1/auth/');
    const token = ehRotaDoResponsavel
      ? (this.authService.accessToken ?? environment.config.token)
      : environment.config.token;
    if (token) {
      const clonedReq = req.clone({
        setHeaders: {
          Authorization: `Bearer ${token}`
        }
      });
      return next.handle(clonedReq);
    }
    return next.handle(req);
  }
}
