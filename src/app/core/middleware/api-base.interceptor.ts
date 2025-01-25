import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent } from '@angular/common/http';
import { Observable } from 'rxjs';
import { appsettings } from '../settings/appsettings';

@Injectable()
export class ApiBaseUrlInterceptor implements HttpInterceptor {
  private baseUrl = appsettings.apiURL; // Obtendo a base URL
  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    // Verifica se a URL já contém "http" (caso seja uma URL externa, não modifica)
    if (!req.url.startsWith('http')) {
      const modifiedReq = req.clone({
        url: `${this.baseUrl}${req.url}`, // Adiciona a base URL automaticamente
      });
      return next.handle(modifiedReq);
    }
    return next.handle(req);
  }
}
