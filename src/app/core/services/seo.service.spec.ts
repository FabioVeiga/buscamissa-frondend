import { TestBed } from '@angular/core/testing';
import { DOCUMENT } from '@angular/common';

import { OG_IMAGE_PADRAO, SeoService } from './seo.service';

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

/**
 * Contrato do JSON-LD: nenhum dado fecha o `<script>`, e o JSON lido de volta é o
 * mesmo objeto. Nome de igreja, pároco e FAQ vêm de cadastro público.
 * A prova contra o serializador do prerender está em scripts/json-ld-ssr.test.mjs.
 */
describe('SeoService — JSON-LD', () => {
  let seo: SeoService;
  let doc: Document;

  const scripts = () => Array.from(doc.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]'));
  const bloco = (id: string) => doc.getElementById(`ld-${id}`) as HTMLScriptElement | null;
  const limparHead = () => scripts().forEach((el) => el.remove());

  const HOSTIS = [
    '</script><img src=x onerror=alert(1)>',
    '</ScRiPt >depois',
    '<!--<script>',
    '<script>alert(1)</script>',
    'aspas "duplas" e \'simples\'',
    'barra \\ invertida e \\u003c literal',
    'Paróquia São João — Coração de Jesus 🙏',
    '',
  ];

  beforeEach(() => {
    TestBed.configureTestingModule({});
    seo = TestBed.inject(SeoService);
    doc = TestBed.inject(DOCUMENT);
    limparHead();
  });

  afterEach(limparHead);

  HOSTIS.forEach((valor) => {
    it(`valor ${JSON.stringify(valor)}: sem "<" no script e JSON.parse devolve o mesmo objeto`, () => {
      const dados = { '@type': 'Church', name: valor, description: `Pároco: ${valor}` };

      seo.setJsonLd('place', dados);

      const texto = bloco('place')!.textContent!;
      expect(texto).not.toContain('<');
      expect(JSON.parse(texto)).toEqual(dados);
    });
  });

  it('nulos e campos ausentes continuam JSON válido e equivalente', () => {
    const dados = { '@type': 'Church', name: 'X', telephone: null, image: undefined, itens: [null, ''] };

    seo.setJsonLd('place', dados);

    expect(JSON.parse(bloco('place')!.textContent!)).toEqual(JSON.parse(JSON.stringify(dados)));
  });

  it('schema normal: mesmo texto de antes (sem "<" o escape não muda nada)', () => {
    const dados = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Início', item: 'https://buscamissa.com.br/' }],
    };

    seo.setJsonLd('breadcrumb', dados);

    expect(bloco('breadcrumb')!.textContent).toBe(JSON.stringify(dados));
  });

  it('vários schemas na mesma página: cada um no seu script, todos válidos', () => {
    seo.setJsonLd('place', { name: '<!--<script>' });
    seo.setJsonLd('breadcrumb', { name: '</script>' });
    seo.setJsonLd('faq', { name: 'normal' });

    expect(scripts().map((s) => s.id).sort()).toEqual(['ld-breadcrumb', 'ld-faq', 'ld-place']);
    expect(scripts().map((s) => JSON.parse(s.textContent!).name)).toEqual(['<!--<script>', '</script>', 'normal']);
  });

  it('reaplicar o mesmo id substitui o conteúdo sem duplicar o script', () => {
    seo.setJsonLd('place', { name: 'A' });
    seo.setJsonLd('place', { name: '</script>B' });

    expect(scripts().length).toBe(1);
    expect(JSON.parse(bloco('place')!.textContent!).name).toBe('</script>B');
  });
});

/**
 * Contrato de og:image: toda página termina com uma imagem de compartilhamento
 * ABSOLUTA. Antes, a rota sem imagem própria removia a tag e o HTML prerenderizado
 * de home/cidade/intenção saía sem og:image — prévia sem imagem no WhatsApp.
 */
describe('SeoService — og:image', () => {
  let seo: SeoService;
  let doc: Document;

  const prop = (p: string) => doc.querySelector(`meta[property="${p}"]`)?.getAttribute('content') ?? null;
  const twitterImage = () => doc.querySelector('meta[name="twitter:image"]')?.getAttribute('content') ?? null;

  const limparHead = () => {
    doc.querySelectorAll('meta[property^="og:image"], meta[name="twitter:image"]').forEach((el) => el.remove());
  };

  beforeEach(() => {
    TestBed.configureTestingModule({});
    seo = TestBed.inject(SeoService);
    doc = TestBed.inject(DOCUMENT);
    limparHead();
  });

  afterEach(limparHead);

  it('a imagem padrão é uma URL absoluta', () => {
    expect(OG_IMAGE_PADRAO.url).toMatch(/^https:\/\//);
  });

  it('sem image: aplica a imagem padrão absoluta com dimensões e alt', () => {
    seo.update({ title: 't' });

    expect(prop('og:image')).toBe(OG_IMAGE_PADRAO.url);
    expect(twitterImage()).toBe(OG_IMAGE_PADRAO.url);
    expect(prop('og:image:width')).toBe('1200');
    expect(prop('og:image:height')).toBe('630');
    expect(prop('og:image:alt')).toBe(OG_IMAGE_PADRAO.alt);
  });

  it('com image: usa a da rota, alt = título e não declara as dimensões da padrão', () => {
    seo.update({ title: 'Paróquia X', image: 'https://cdn.test/igreja.jpg' });

    expect(prop('og:image')).toBe('https://cdn.test/igreja.jpg');
    expect(twitterImage()).toBe('https://cdn.test/igreja.jpg');
    expect(prop('og:image:alt')).toBe('Paróquia X');
    expect(prop('og:image:width')).toBeNull();
    expect(prop('og:image:height')).toBeNull();
  });

  it('navegação SPA: a foto da paróquia anterior não vaza para a rota seguinte', () => {
    seo.update({ title: 'Paróquia X', image: 'https://cdn.test/igreja.jpg' });

    seo.update({ title: 'Missas em São Paulo' });

    expect(prop('og:image')).toBe(OG_IMAGE_PADRAO.url);
    expect(twitterImage()).toBe(OG_IMAGE_PADRAO.url);
    expect(prop('og:image:width')).toBe('1200');
  });
});
