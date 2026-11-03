import { Injectable } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';

declare function gtag(...args: unknown[]): void;

/** Canal do compartilhamento (parâmetro `method` do evento `share` do GA4). */
export type ShareMethod = 'native' | 'copy_link' | 'whatsapp';
/** O que foi compartilhado (parâmetro `content_type` do evento `share` do GA4). */
export type ShareContentType = 'igreja' | 'cidade';

@Injectable({ providedIn: 'root' })
export class AnalyticsService {

  constructor(private router: Router) {}

  /** Registra pageviews automáticos em cada navegação SPA */
  initPageTracking(): void {
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => {
        if (typeof gtag === 'undefined') return;
        gtag('event', 'page_view', { page_path: e.urlAfterRedirects });
      });
  }

  /** Usuário buscou por cidade */
  searchPerformed(cidade: string, uf: string): void {
    this._send('search_performed', { cidade, uf });
  }

  /** Usuário abriu a página de uma paróquia */
  churchView(churchName: string, cidade: string, uf: string): void {
    this._send('church_view', { church_name: churchName, cidade, uf });
  }

  /** Usuário visualizou horários de missa */
  massScheduleView(churchName: string): void {
    this._send('mass_schedule_view', { church_name: churchName });
  }

  /** Usuário clicou em "Como chegar" */
  getDirections(churchName: string): void {
    this._send('get_directions', { church_name: churchName });
  }

  /** Usuário enviou contribuição (confirmação ou denúncia) */
  userContribution(type: 'confirm' | 'report', churchName: string): void {
    this._send('user_contribution', { contribution_type: type, church_name: churchName });
  }

  /** Usuário clicou em "Missa agora" */
  missaAgoraOpen(source: 'home_cta' | 'navbar'): void {
    this._send('missa_agora_open', { source });
  }

  /** Usuário iniciou uma busca (clicou no CTA da home) */
  searchStarted(): void {
    this._send('search_started');
  }

  /** Usuário clicou em um card de resultado (home ou cidade) */
  resultClicked(churchName: string, cidade: string, uf: string): void {
    this._send('result_clicked', { church_name: churchName, cidade, uf });
  }

  /** Usuário clicou em um card na tela /missa-agora */
  missaAgoraCardClicked(churchName: string): void {
    this._send('missa_agora_card_clicked', { church_name: churchName });
  }

  /** Usuário salvou uma paróquia favorita */
  favoriteParishSaved(churchName: string): void {
    this._send('favorite_parish_saved', { church_name: churchName });
  }

  /**
   * Usuário compartilhou uma página — evento recomendado `share` do GA4.
   * `itemId` é o slug do conteúdo (igreja: slug da paróquia; cidade: `uf/cidade`).
   * Em cidade não há igreja: `churchName` vazio fica fora do evento.
   */
  share(
    method: ShareMethod,
    churchName: string,
    cidade: string,
    uf: string,
    itemId: string,
    contentType: ShareContentType = 'igreja',
  ): void {
    const params: Record<string, string> = { method, content_type: contentType, item_id: itemId, cidade, uf };
    if (churchName) params['church_name'] = churchName;
    this._send('share', params);
  }

  private _send(eventName: string, params: Record<string, string> = {}): void {
    if (typeof gtag === 'undefined') return;
    gtag('event', eventName, params);
  }
}
