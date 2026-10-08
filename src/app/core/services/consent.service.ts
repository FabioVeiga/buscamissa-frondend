import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import type * as CookieConsentApi from 'vanilla-cookieconsent';

type Cc = typeof CookieConsentApi;

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    clarity?: (...args: unknown[]) => void;
    __bmIniciarClarity?: () => void;
  }
}

/**
 * Consentimento de cookies (LGPD) com a biblioteca open source vanilla-cookieconsent (MIT).
 * Categorias: "necessary" (sempre ativa) e "analytics" (GA4 + Microsoft Clarity).
 * O Consent Mode do Google fica "denied" por padrão (index.html) e é atualizado aqui;
 * o Clarity só carrega após o consentimento de "analytics".
 */
@Injectable({ providedIn: 'root' })
export class ConsentService {
  private readonly _isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private _cc: Cc | null = null;
  private _iniciado = false;

  /** Carrega a biblioteca fora do caminho crítico (idle) e exibe o banner se ainda não houve decisão. */
  iniciar(): void {
    if (!this._isBrowser || this._iniciado) return;
    this._iniciado = true;

    const carregar = () => void this._carregar();
    if ('requestIdleCallback' in window) {
      requestIdleCallback(carregar, { timeout: 2500 });
    } else {
      setTimeout(carregar, 1500);
    }
  }

  /** Reabre o painel de preferências (revogação/alteração do consentimento). */
  abrirPreferencias(): void {
    if (this._cc) {
      this._cc.showPreferences();
    } else {
      void this._carregar().then(() => this._cc?.showPreferences());
    }
  }

  private async _carregar(): Promise<void> {
    if (this._cc) return;
    const cc = (await import('vanilla-cookieconsent')) as Cc;
    this._cc = cc;

    await cc.run({
      mode: 'opt-in',
      revision: 1,
      autoClearCookies: true,
      hideFromBots: true,
      cookie: { name: 'bm_consent', expiresAfterDays: 365, sameSite: 'Lax' },
      guiOptions: {
        consentModal: { layout: 'box inline', position: 'bottom left', equalWeightButtons: true, flipButtons: false },
        preferencesModal: { layout: 'box', equalWeightButtons: true, flipButtons: false },
      },
      categories: {
        necessary: { enabled: true, readOnly: true },
        analytics: {
          autoClear: {
            cookies: [
              { name: /^_ga/ },
              { name: '_gid' },
              { name: '_clck' },
              { name: '_clsk' },
              { name: 'CLID' },
              { name: 'MUID' },
              { name: 'SM' },
              { name: 'ANONCHK' },
            ],
          },
        },
      },
      onConsent: () => this._aplicar(),
      onChange: () => this._aplicar(),
      language: {
        default: 'pt-BR',
        translations: { 'pt-BR': TEXTOS_PT_BR },
      },
    });

    this._aplicar();
  }

  private _aplicar(): void {
    if (!this._cc) return;
    const analitico = this._cc.acceptedCategory('analytics');

    window.gtag?.('consent', 'update', {
      analytics_storage: analitico ? 'granted' : 'denied',
    });

    if (analitico) {
      window.__bmIniciarClarity?.();
    } else {
      window.clarity?.('consent', false);
    }
  }
}

const TEXTOS_PT_BR: CookieConsentApi.Translation = {
  consentModal: {
    title: 'Sua privacidade importa',
    description:
      'Usamos cookies necessários para o site funcionar e, com a sua permissão, cookies de análise para entender como o BuscaMissa é usado e melhorá-lo. Você pode aceitar, recusar ou escolher quais categorias permitir. Saiba mais na <a href="/cookies">Política de Cookies</a>.',
    acceptAllBtn: 'Aceitar todos',
    acceptNecessaryBtn: 'Recusar não essenciais',
    showPreferencesBtn: 'Escolher cookies',
  },
  preferencesModal: {
    title: 'Preferências de cookies',
    acceptAllBtn: 'Aceitar todos',
    acceptNecessaryBtn: 'Recusar não essenciais',
    savePreferencesBtn: 'Salvar minhas escolhas',
    closeIconLabel: 'Fechar',
    sections: [
      {
        title: 'Como usamos cookies',
        description:
          'Cookies são pequenos arquivos guardados no seu dispositivo. Você pode escolher o que permitir e mudar de ideia a qualquer momento. Detalhes na <a href="/cookies">Política de Cookies</a>.',
      },
      {
        title: 'Estritamente necessários',
        description:
          'Garantem o funcionamento do site e guardam a sua escolha de cookies. Não podem ser desativados.',
        linkedCategory: 'necessary',
        cookieTable: {
          caption: 'Cookies necessários',
          headers: { name: 'Nome', desc: 'Finalidade', exp: 'Validade' },
          body: [{ name: 'bm_consent', desc: 'Guarda a sua escolha de cookies.', exp: '12 meses' }],
        },
      },
      {
        title: 'Análise e desempenho',
        description:
          'Nos ajudam a entender quais páginas são mais usadas e onde o site pode melhorar (Google Analytics e Microsoft Clarity). Só são ativados se você permitir.',
        linkedCategory: 'analytics',
        cookieTable: {
          caption: 'Cookies de análise',
          headers: { name: 'Nome', domain: 'Serviço', desc: 'Finalidade', exp: 'Validade' },
          body: [
            { name: '_ga, _ga_*', domain: 'Google Analytics', desc: 'Distingue visitantes e sessões para estatísticas de uso.', exp: 'até 2 anos' },
            { name: '_clck, _clsk, CLID', domain: 'Microsoft Clarity', desc: 'Identifica a sessão para análise de uso e mapas de calor.', exp: 'até 1 ano' },
          ],
        },
      },
    ],
  },
};
