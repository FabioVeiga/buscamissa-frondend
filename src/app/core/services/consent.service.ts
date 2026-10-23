import { HttpClient } from '@angular/common/http';
import { inject, Injectable, NgZone, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import type * as CookieConsentApi from 'vanilla-cookieconsent';
import { LoggerService } from './logger.service';

interface DecisaoConsentimento {
  cookie: CookieConsentApi.CookieValue;
  tipo: 'primeira' | 'alterou';
}

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    clarity?: (...args: unknown[]) => void;
    __bmIniciarClarity?: () => void;
    __bmConsentFila?: DecisaoConsentimento[];
    __bmConsentPronto?: boolean;
  }
}

/**
 * Consentimento de cookies (LGPD) com a biblioteca open source vanilla-cookieconsent (MIT).
 *
 * O banner NÃO é aberto aqui: roda em public/consentimento.js, script async do
 * index.html, para pintar junto com o conteúdo em vez de depois da hidratação
 * (aberto pelo Angular, era o LCP tardio das páginas de cidade). Aquele script
 * também aplica o Consent Mode do Google e o Clarity.
 *
 * Aqui fica o que depende do Angular: o registro da prova de consentimento no
 * backend (o HttpClient conhece a URL da API) e reabrir o painel de preferências.
 */
@Injectable({ providedIn: 'root' })
export class ConsentService {
  private readonly _isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly _http = inject(HttpClient);
  private readonly _logger = inject(LoggerService);
  private readonly _zone = inject(NgZone);
  private _iniciado = false;

  /** Passa a registrar as decisões do banner, inclusive as tomadas antes do bootstrap. */
  iniciar(): void {
    if (!this._isBrowser || this._iniciado) return;
    this._iniciado = true;

    window.__bmConsentFila = window.__bmConsentFila ?? [];
    this._zone.runOutsideAngular(() =>
      window.addEventListener('bm-consentimento', () => this._drenarFila()),
    );
    this._drenarFila();
  }

  /** Reabre o painel de preferências (revogação/alteração do consentimento). */
  abrirPreferencias(): void {
    if (!this._isBrowser) return;
    if (window.__bmConsentPronto) {
      window.CookieConsent?.showPreferences();
    } else {
      window.addEventListener('bm-consent-pronto', () => window.CookieConsent?.showPreferences(), { once: true });
    }
  }

  private _drenarFila(): void {
    const fila = window.__bmConsentFila ?? [];
    while (fila.length) {
      const { cookie, tipo } = fila.shift()!;
      this._registrar(cookie, tipo);
    }
  }

  /** Prova de consentimento (LGPD): registro anônimo no backend, fire-and-forget. */
  private _registrar(cookie: CookieConsentApi.CookieValue, tipo: 'primeira' | 'alterou'): void {
    const categorias = cookie.categories ?? [];
    const analitico = categorias.includes('analytics');
    const acao = tipo === 'alterou' ? 'alterou' : analitico ? 'aceitou_todos' : 'recusou';

    this._http
      .post('v2/consentimentos', {
        consentId: cookie.consentId,
        acao,
        categorias: categorias.join(','),
        revisao: cookie.revision ?? 0,
      })
      .subscribe({ error: (err) => this._logger.logError(err, 'consentimento') });
  }
}
