import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AnalyticsService } from './analytics.service';

/**
 * Contrato do evento `share` (evento recomendado do GA4). Os nomes dos parâmetros
 * são os do GA4 (`method`, `content_type`, `item_id`) — trocá-los quebra os
 * relatórios nativos de compartilhamento.
 */
describe('AnalyticsService — share', () => {
  let analytics: AnalyticsService;
  let gtagSpy: jasmine.Spy;
  const w = window as unknown as { gtag?: unknown };
  let gtagOriginal: unknown;

  beforeEach(() => {
    gtagOriginal = w.gtag;
    gtagSpy = jasmine.createSpy('gtag');
    w.gtag = gtagSpy;
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    analytics = TestBed.inject(AnalyticsService);
  });

  afterEach(() => {
    if (gtagOriginal === undefined) delete w.gtag;
    else w.gtag = gtagOriginal;
  });

  it('igreja: envia share com method, content_type, item_id, church_name, cidade e uf', () => {
    analytics.share('whatsapp', 'Paróquia X', 'São Paulo', 'SP', 'paroquia-x');

    expect(gtagSpy).toHaveBeenCalledWith('event', 'share', {
      method: 'whatsapp',
      content_type: 'igreja',
      item_id: 'paroquia-x',
      church_name: 'Paróquia X',
      cidade: 'São Paulo',
      uf: 'SP',
    });
  });

  it('cidade: content_type cidade e sem church_name', () => {
    analytics.share('copy_link', '', 'São Paulo', 'sp', 'sp/sao-paulo', 'cidade');

    expect(gtagSpy).toHaveBeenCalledWith('event', 'share', {
      method: 'copy_link',
      content_type: 'cidade',
      item_id: 'sp/sao-paulo',
      cidade: 'São Paulo',
      uf: 'sp',
    });
  });
});
