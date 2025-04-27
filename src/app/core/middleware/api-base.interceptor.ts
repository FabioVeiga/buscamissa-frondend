import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable()
export class ApiBaseUrlInterceptor implements HttpInterceptor {
  private baseUrl = environment.config.apiURL; // Obtendo a base URL
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
