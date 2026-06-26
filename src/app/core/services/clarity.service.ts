import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ClarityService {
  /** Rota anterior — atualizada pelo AppComponent a cada NavigationEnd */
  private _prevRoute = '';

  get prevRoute(): string { return this._prevRoute; }
  setPrevRoute(route: string): void { this._prevRoute = route; }

  private get c(): any { return (window as any).clarity; }

  track(event: string, params?: Record<string, string | number | boolean>): void {
    if (!this.c) return;
    this.c('event', event, params);
  }

  tag(key: string, value: string): void {
    if (!this.c) return;
    this.c('set', key, value);
  }

  /** Detecta origem da sessão pelo document.referrer (só é preciso na primeira carga). */
  detectSessionOrigin(): string {
    const ref = document.referrer;
    if (!ref) return 'direto';
    if (/google\.|bing\.|yahoo\./i.test(ref)) return 'buscador';
    if (/facebook\.com|fb\.com|instagram\.com/i.test(ref)) return 'redes_sociais';
    if (/whatsapp/i.test(ref)) return 'compartilhamento';
    return 'externo';
  }

  /** Derivia origem de navegação interna a partir da rota anterior. */
  navOrigem(currentRoute: string): string {
    const prev = this._prevRoute;
    if (!prev) return 'direto';
    if (prev.includes('/minhas-igrejas')) return 'favoritos';
    if (prev.includes('/missas/')) return 'cidade';
    if (prev.includes('/home') || prev === '/' || prev.includes('/buscar')) return 'home';
    if (prev.includes('/paroquia/') || prev.includes('/igrejas/')) return 'igreja';
    return 'outro';
  }
}
