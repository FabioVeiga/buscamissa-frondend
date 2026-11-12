import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CANONICAL, DESCRIPTION, TITLE,
  analisarHtmlCidades, resumir, rotasDoBulk, rotasPrincipais, verificarSeoCidades,
} from './verificar-seo-cidades.mjs';

const ESTADOS = [
  { uf: 'SP', cidades: [{ cidadeSlug: 'sao-paulo', totalParoquias: 509 }, { cidadeSlug: 'campinas', totalParoquias: 90 }] },
  { uf: 'PR', cidades: [{ cidadeSlug: 'itapejara-d-oeste', totalParoquias: 4 }] },
];

const ROTAS = ['/missas/sp/sao-paulo', '/missas/sp/campinas', '/missas/pr/itapejara-d-oeste'];

/** HTML mínimo no formato que o prerender emite; cada opção quebra UMA coisa. */
function pagina({
  rotas = ROTAS,
  canonical = `<link rel="canonical" href="${CANONICAL}">`,
  robots = 'index, follow',
  title = TITLE,
  description = DESCRIPTION,
  h1 = '<h1 class="ph-hero__titulo">Horários de Missa\npor<span> Cidade</span></h1>',
  itens = rotas,
  numberOfItems = itens.length,
  breadcrumb = ['https://buscamissa.com.br/', CANONICAL],
  linkEstados = '<a class="ver-estados" href="/estados">Ver por estado</a>',
} = {}) {
  const ld = (id, obj) => `<script id="ld-${id}" type="application/ld+json">${JSON.stringify(obj)}</script>`;
  return `<!doctype html><html><head>
<title>${title}</title>
<meta name="description" content="${description}">
<meta name="robots" content="${robots}">
${canonical}
${ld('breadcrumb', {
    '@type': 'BreadcrumbList',
    itemListElement: breadcrumb.map((item, i) => ({ '@type': 'ListItem', position: i + 1, item })),
  })}
${ld('itemlist', {
    '@type': 'ItemList',
    numberOfItems,
    itemListElement: itens.map((r, i) => ({
      '@type': 'ListItem', position: i + 1, item: `https://buscamissa.com.br${r}`,
    })),
  })}
</head><body>${h1}
<a href="/missas/sp">São Paulo (estado)</a>
<a href="/cidades">Cidades</a>
${linkEstados}
${rotas.map((r) => `<a _ngc-e="" class="cidade-link cidade-link--oculto" href="${r}" jsaction="click:;">x</a>`).join('\n')}
</body></html>`;
}

const veredito = (opcoes, esperadas = rotasPrincipais(ESTADOS)) =>
  verificarSeoCidades(analisarHtmlCidades(pagina(opcoes)), esperadas);

test('rotasDoBulk monta /missas/{uf}/{slug} com a UF em minúsculo', () => {
  assert.deepEqual([...rotasDoBulk(ESTADOS)].sort(), [...ROTAS].sort());
  assert.equal(rotasDoBulk([{ uf: 'SP' }, { cidades: [{ cidadeSlug: 'x' }] }, null]).size, 0);
});

test('rotasPrincipais: mais paróquias primeiro, corta no cap', () => {
  assert.deepEqual([...rotasPrincipais(ESTADOS, 2)], ['/missas/sp/sao-paulo', '/missas/sp/campinas']);
  assert.equal(rotasPrincipais(ESTADOS).size, 3);
});

test('rotasPrincipais: empate mantém a ordem do bulk (sort estável, como no componente)', () => {
  const empate = [
    { uf: 'BA', cidades: [{ cidadeSlug: 'a', totalParoquias: 5 }] },
    { uf: 'AC', cidades: [{ cidadeSlug: 'b', totalParoquias: 5 }] },
  ];
  assert.deepEqual([...rotasPrincipais(empate, 1)], ['/missas/ba/a']);
});

test('sem link para /estados falha', () => {
  assert.match(veredito({ linkEstados: '' }).problemas.join('\n'), /sem link para \/estados/);
});

test('página íntegra passa', () => {
  assert.deepEqual(veredito(), { ok: true, problemas: [] });
});

test('só conta link de CIDADE: hub de UF e outras rotas ficam de fora', () => {
  const a = analisarHtmlCidades(pagina());
  assert.deepEqual([...a.linksCidade].sort(), [...ROTAS].sort());
});

test('link repetido (vitrine + acordeão) conta uma vez', () => {
  const a = analisarHtmlCidades(pagina({ rotas: [...ROTAS, '/missas/sp/sao-paulo'], itens: ROTAS }));
  assert.equal(a.linksCidade.size, 3);
});

test('link oculto por classe continua contando — está no HTML inicial', () => {
  assert.equal(veredito().ok, true);
});

test('cidade do bulk sem link no HTML falha e cita a rota', () => {
  const r = veredito({ rotas: ROTAS.slice(0, 2) });
  assert.equal(r.ok, false);
  assert.match(r.problemas.join('\n'), /1 cidade\(s\) principal\(is\) sem link.*itapejara-d-oeste/);
});

test('link de cidade fora das principais falha', () => {
  const r = veredito({ rotas: [...ROTAS, '/missas/sp/inventada'] });
  assert.equal(r.ok, false);
  assert.match(r.problemas.join('\n'), /1 link\(s\) de cidade fora das principais.*inventada/);
});

test('HTML sem nenhum link de cidade falha (página virou shell CSR)', () => {
  const r = veredito({ rotas: [], itens: [] }, null);
  assert.match(r.problemas.join('\n'), /nenhum link/);
});

test('canonical ausente, trocado ou duplicado falha', () => {
  assert.equal(veredito({ canonical: '' }).ok, false);
  assert.equal(veredito({ canonical: '<link rel="canonical" href="https://buscamissa.com.br/">' }).ok, false);
  const duas = `<link rel="canonical" href="${CANONICAL}">`.repeat(2);
  assert.equal(veredito({ canonical: duas }).ok, false);
});

test('robots com noindex ou nofollow falha', () => {
  assert.equal(veredito({ robots: 'noindex, follow' }).ok, false);
  assert.equal(veredito({ robots: 'index, nofollow' }).ok, false);
});

test('title e description são fixos', () => {
  assert.match(veredito({ title: 'Todas as cidades | BuscaMissa' }).problemas.join('\n'), /title mudou/);
  assert.match(veredito({ description: 'outra' }).problemas.join('\n'), /meta description mudou/);
});

test('o TEXTO do h1 é livre; a quantidade não', () => {
  assert.equal(veredito({ h1: '<h1>Encontre a missa na sua cidade</h1>' }).ok, true);
  assert.equal(veredito({ h1: '' }).ok, false);
  assert.equal(veredito({ h1: '<h1>a</h1><h1>b</h1>' }).ok, false);
  assert.equal(veredito({ h1: '<h1> <span></span> </h1>' }).ok, false);
});

test('h1 é lido sem as tags internas', () => {
  assert.deepEqual(analisarHtmlCidades(pagina()).h1, ['Horários de Missa por Cidade']);
});

test('ItemList precisa bater com os links do HTML', () => {
  const r = veredito({ itens: ROTAS.slice(0, 2) });
  assert.match(r.problemas.join('\n'), /ItemList e links do HTML divergem: 0 item\(ns\) sem <a>, 1 <a> sem item/);
  assert.match(veredito({ numberOfItems: 99 }).problemas.join('\n'), /numberOfItems \(99\)/);
});

test('BreadcrumbList precisa ser Início › Cidades', () => {
  assert.equal(veredito({ breadcrumb: ['https://buscamissa.com.br/'] }).ok, false);
});

test('JSON-LD ausente ou inválido falha', () => {
  const semLd = pagina().replace(/<script id="ld-itemlist"[\s\S]*?<\/script>/, '');
  assert.match(
    verificarSeoCidades(analisarHtmlCidades(semLd), rotasPrincipais(ESTADOS)).problemas.join('\n'),
    /um ItemList; veio 0/,
  );
  const quebrado = pagina().replace('{"@type":"BreadcrumbList"', '{"@type":BreadcrumbList');
  assert.match(
    verificarSeoCidades(analisarHtmlCidades(quebrado), rotasPrincipais(ESTADOS)).problemas.join('\n'),
    /JSON inválido/,
  );
});

test('sem bulk em disco a verificação é só interna e ainda passa', () => {
  assert.equal(veredito({}, null).ok, true);
});

test('resumir devolve os números do antes × depois', () => {
  const r = resumir(analisarHtmlCidades(pagina()));
  assert.equal(r.linksCidade, 3);
  assert.equal(r.ufsComLink, 2);
  assert.equal(r.itemListNumberOfItems, 3);
  assert.deepEqual(r.jsonLd, ['BreadcrumbList', 'ItemList']);
  assert.equal(r.canonical, CANONICAL);
});
