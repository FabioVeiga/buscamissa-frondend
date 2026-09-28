import { TestBed } from '@angular/core/testing';
import { DOCUMENT } from '@angular/common';

import { SeoService } from './seo.service';

/**
 * Contrato de canonical/robots do SeoService.
 *
 * O que ele defende: uma página que não sabe qual é a sua canonical — ou que está
 * fora do índice — termina SEM `<link rel="canonical">`. Antes, qualquer chamada sem
 * canonical caía no `document.URL`, e a página "Paróquia não encontrada" de uma URL
 * inexistente declarava a si mesma como canônica, junto com `noindex`.
 */
describe('SeoService — canonical e robots', () => {
  let seo: SeoService;
  let doc: Document;

  const canonical = () => doc.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null;
  const ogUrl = () => doc.querySelector('meta[property="og:url"]')?.getAttribute('content') ?? null;
  const robots = () => doc.querySelector('meta[name="robots"]')?.getAttribute('content') ?? null;

  const limparHead = () => {
    doc.querySelectorAll('link[rel="canonical"], meta[property="og:url"], meta[name="robots"]')
      .forEach((el) => el.remove());
  };

  beforeEach(() => {
    TestBed.configureTestingModule({});
    seo = TestBed.inject(SeoService);
    doc = TestBed.inject(DOCUMENT);
    limparHead();
  });

  afterEach(limparHead);

  it('canonical informada: cria o link e o og:url', () => {
    seo.update({ title: 't', canonical: 'https://buscamissa.com.br/missas/pb/joao-pessoa' });

    expect(canonical()).toBe('https://buscamissa.com.br/missas/pb/joao-pessoa');
    expect(ogUrl()).toBe('https://buscamissa.com.br/missas/pb/joao-pessoa');
  });

  it('canonical null: remove o link e o og:url que já existiam', () => {
    seo.update({ title: 't', canonical: 'https://buscamissa.com.br/anterior' });

    seo.update({ title: 't', canonical: null });

    expect(canonical()).toBeNull();
    expect(ogUrl()).toBeNull();
  });

  it('canonical undefined: mantém o fallback de sempre, a URL do documento', () => {
    seo.update({ title: 't' });

    expect(canonical()).toBe(doc.URL.split('?')[0]);
  });

  it('noindex remove a canonical mesmo quando uma é informada', () => {
    seo.update({ title: 't', canonical: 'https://buscamissa.com.br/anterior' });

    seo.update({ title: 't', canonical: 'https://buscamissa.com.br/missas/xx', noindex: true });

    expect(canonical()).withContext('página fora do índice não tem versão canônica').toBeNull();
    expect(ogUrl()).toBeNull();
  });

  it('robots: index por padrão, noindex/nofollow e noindex/follow', () => {
    seo.update({ title: 't' });
    expect(robots()).toBe('index, follow');

    seo.update({ title: 't', noindex: true });
    expect(robots()).toBe('noindex, nofollow');

    seo.update({ title: 't', noindex: true, seguirLinks: true });
    expect(robots()).toBe('noindex, follow');
  });
});
