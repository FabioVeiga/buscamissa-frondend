// Linha de base de SEO do hub `/cidades` (11/11/2026, antes da reformulação visual).
// Sem disco: recebe o HTML prerenderizado e devolve o veredito (o script em scripts/
// faz o I/O).
//
// Por que existe: `/cidades` era o hub com mais links internos do site (em produção,
// 2.188 cidades em 11/11/2026). Este guard fixa o que NÃO pode mudar sem decisão:
// os links de cidade no HTML inicial (sem depender de JavaScript), canonical,
// robots, title, description, um único <h1> e os dois JSON-LD.
//
// Mudança aprovada (11/11/2026): o acordeão com TODAS as cidades por estado saiu de
// `/cidades`, trocado por um link para `/estados`. Toda cidade continua com <a> na
// página do seu estado (`/missas/:uf`, prerenderizada) e no sitemap. A partir daí
// o contrato é: `/cidades` linka EXATAMENTE as principais cidades (as TOP_CIDADES
// com mais paróquias, mesma regra do componente) e linka `/estados`.
//
// O TEXTO do <h1> fica de fora de propósito: ele muda na reformulação (decisão de
// produto). O que se preserva é a estrutura — exatamente um <h1>, não vazio.

export const CANONICAL = 'https://buscamissa.com.br/cidades';
export const TITLE = 'Cidades com missas cadastradas — horários por cidade | BuscaMissa';
export const DESCRIPTION =
  'Encontre horários de missa em qualquer cidade do Brasil. Escolha o estado e veja as paróquias e comunidades católicas cadastradas.';

const SITE = 'https://buscamissa.com.br';

/** Mesmo cap de `TOP_CIDADES` em `cidades.component.ts`. */
export const TOP_CIDADES = 8;

/** Entidades que o Angular emite em texto/atributo — o bastante para comparar strings. */
function decodificar(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

function atributo(tag, nome) {
  const m = tag.match(new RegExp(`\\b${nome}="([^"]*)"`, 'i'));
  return m ? decodificar(m[1]) : null;
}

function conteudoMeta(html, nome) {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    if (atributo(tag, 'name') === nome) return atributo(tag, 'content');
  }
  return null;
}

/**
 * Todas as rotas `/missas/{uf}/{cidade}` do bulk `/v2/seo/estados`
 * (`.prerender-cache/estados.json`) — a MESMA fonte que o componente usa.
 */
export function rotasDoBulk(estados) {
  const rotas = new Set();
  for (const e of estados ?? []) {
    if (!e?.uf) continue;
    for (const c of e.cidades ?? []) {
      if (c?.cidadeSlug) rotas.add(`/missas/${e.uf.toLowerCase()}/${c.cidadeSlug}`);
    }
  }
  return rotas;
}

/**
 * As principais cidades, na regra do componente: achata o bulk na ordem em que
 * vem, ordena por `totalParoquias` decrescente (sort estável: empate mantém a
 * ordem do bulk) e corta em TOP_CIDADES.
 */
export function rotasPrincipais(estados, n = TOP_CIDADES) {
  const todas = [];
  for (const e of estados ?? []) {
    if (!e?.uf) continue;
    for (const c of e.cidades ?? []) {
      if (c?.cidadeSlug) {
        todas.push({ rota: `/missas/${e.uf.toLowerCase()}/${c.cidadeSlug}`, total: c.totalParoquias ?? 0 });
      }
    }
  }
  return new Set(todas.sort((a, b) => b.total - a.total).slice(0, n).map((c) => c.rota));
}

/** Extrai do HTML tudo o que a linha de base compara. Não decide nada. */
export function analisarHtmlCidades(html) {
  const linksCidade = new Set();
  for (const m of html.matchAll(/<a\b[^>]*\bhref="(\/missas\/[a-z]{2}\/[^"/?#]+)"/gi)) {
    linksCidade.add(decodificar(m[1]));
  }

  const linkEstados = /<a\b[^>]*\bhref="\/estados"/i.test(html);

  const canonicais = (html.match(/<link\b[^>]*>/gi) ?? [])
    .filter((tag) => atributo(tag, 'rel') === 'canonical')
    .map((tag) => atributo(tag, 'href'));

  const h1 = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) =>
    decodificar(m[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim(),
  );

  const jsonLd = [];
  const jsonLdInvalidos = [];
  for (const m of html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      jsonLd.push(JSON.parse(m[1]));
    } catch {
      jsonLdInvalidos.push(m[1].slice(0, 80));
    }
  }

  const titulo = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);

  return {
    linksCidade,
    linkEstados,
    canonicais,
    robots: conteudoMeta(html, 'robots'),
    title: titulo ? decodificar(titulo[1]).trim() : null,
    description: conteudoMeta(html, 'description'),
    h1,
    jsonLd,
    jsonLdInvalidos,
    bytes: Buffer.byteLength(html, 'utf8'),
  };
}

/**
 * Veredito. `esperadas` é o Set de `rotasPrincipais()`; sem ele (HTML baixado de um
 * ambiente cujo bulk não está em disco) a comparação é só interna: links do HTML
 * contra o ItemList do próprio HTML.
 */
export function verificarSeoCidades(analise, esperadas = null) {
  const problemas = [];
  const links = analise.linksCidade;

  if (links.size === 0) problemas.push('nenhum link /missas/{uf}/{cidade} no HTML inicial.');
  if (!analise.linkEstados) {
    problemas.push('sem link para /estados — é o caminho para as cidades fora das principais.');
  }

  if (esperadas) {
    const faltando = [...esperadas].filter((r) => !links.has(r));
    const sobrando = [...links].filter((r) => !esperadas.has(r));
    if (faltando.length) {
      problemas.push(
        `${faltando.length} cidade(s) principal(is) sem link no HTML inicial (ex.: ${faltando.slice(0, 5).join(', ')}).`,
      );
    }
    if (sobrando.length) {
      problemas.push(
        `${sobrando.length} link(s) de cidade fora das principais (ex.: ${sobrando.slice(0, 5).join(', ')}).`,
      );
    }
  }

  if (analise.canonicais.length !== 1 || analise.canonicais[0] !== CANONICAL) {
    problemas.push(`canonical deveria ser um só e igual a ${CANONICAL}; veio ${JSON.stringify(analise.canonicais)}.`);
  }

  const robots = (analise.robots ?? '').toLowerCase();
  if (!/\bindex\b/.test(robots) || /noindex|nofollow/.test(robots)) {
    problemas.push(`robots deveria ser "index, follow"; veio ${JSON.stringify(analise.robots)}.`);
  }

  if (analise.title !== TITLE) problemas.push(`title mudou: ${JSON.stringify(analise.title)}.`);
  if (analise.description !== DESCRIPTION) {
    problemas.push(`meta description mudou: ${JSON.stringify(analise.description)}.`);
  }

  if (analise.h1.length !== 1 || !analise.h1[0]) {
    problemas.push(`deveria haver exatamente um <h1> não vazio; veio ${JSON.stringify(analise.h1)}.`);
  }

  if (analise.jsonLdInvalidos.length) {
    problemas.push(`${analise.jsonLdInvalidos.length} bloco(s) JSON-LD com JSON inválido.`);
  }

  const breadcrumb = analise.jsonLd.filter((j) => j?.['@type'] === 'BreadcrumbList');
  if (breadcrumb.length !== 1) {
    problemas.push(`deveria haver um BreadcrumbList; veio ${breadcrumb.length}.`);
  } else {
    const itens = (breadcrumb[0].itemListElement ?? []).map((i) => i?.item);
    if (itens.length !== 2 || itens[0] !== `${SITE}/` || itens[1] !== CANONICAL) {
      problemas.push(`BreadcrumbList deveria ser Início › Cidades; veio ${JSON.stringify(itens)}.`);
    }
  }

  const itemList = analise.jsonLd.filter((j) => j?.['@type'] === 'ItemList');
  if (itemList.length !== 1) {
    problemas.push(`deveria haver um ItemList; veio ${itemList.length}.`);
  } else {
    const itens = new Set((itemList[0].itemListElement ?? []).map((i) => String(i?.item ?? '').replace(SITE, '')));
    if (itemList[0].numberOfItems !== itens.size) {
      problemas.push(`ItemList.numberOfItems (${itemList[0].numberOfItems}) difere dos itens listados (${itens.size}).`);
    }
    const semLink = [...itens].filter((r) => !links.has(r));
    const semItem = [...links].filter((r) => !itens.has(r));
    if (semLink.length || semItem.length) {
      problemas.push(
        `ItemList e links do HTML divergem: ${semLink.length} item(ns) sem <a>, ${semItem.length} <a> sem item.`,
      );
    }
  }

  return { ok: problemas.length === 0, problemas };
}

/** Resumo comparável (antes × depois): só valores, sem os conjuntos inteiros. */
export function resumir(analise) {
  const tipos = analise.jsonLd.map((j) => j?.['@type']).sort();
  const itemList = analise.jsonLd.find((j) => j?.['@type'] === 'ItemList');
  return {
    linksCidade: analise.linksCidade.size,
    linkEstados: analise.linkEstados,
    ufsComLink: new Set([...analise.linksCidade].map((r) => r.split('/')[2])).size,
    canonical: analise.canonicais[0] ?? null,
    robots: analise.robots,
    title: analise.title,
    description: analise.description,
    h1: analise.h1,
    jsonLd: tipos,
    itemListNumberOfItems: itemList?.numberOfItems ?? null,
    bytes: analise.bytes,
  };
}
