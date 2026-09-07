/**
 * Fonte única da SELEÇÃO de paróquias que entram no prerender — extraída de
 * `app.routes.server.ts` em 2026-09-07 para ser reaproveitada por
 * `scripts/gerar-sitemap.mjs` (filtrar do sitemap as URLs que não terão HTML).
 *
 * Puro refactor: mesmo algoritmo, mesma fonte (`.prerender-cache/paroquias.json`,
 * lido de `process.cwd()`), mesmo resultado. `app.routes.server.ts` passou a
 * importar `paroquiasDoDisco` daqui em vez de defini-la localmente.
 *
 * Consumido por dois runtimes distintos, como `seo-routes.mjs`:
 *   1. `scripts/gerar-sitemap.mjs` — script Node standalone (prebuild).
 *   2. `src/app/app.routes.server.ts` — `getPrerenderParams` no bundle server.
 *
 * Por isso depende só de `node:fs`/`node:path` (disponíveis nos dois runtimes),
 * nunca de `fetch`/API — a seleção é sempre derivada do cache em disco.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Teto de páginas de paróquia prerenderizadas.
 *
 * NÃO é uma escolha editorial — é orçamento de arquivos. O Azure SWA faz polling por
 * 300 s na distribuição de conteúdo e desiste; o gatilho é a CONTAGEM DE ARQUIVOS, não
 * o tamanho. Evidência de produção:
 *
 *   3.311 arquivos → deploy OK   (12/08)
 *   6.050 arquivos → "Failure during content distribution" aos 298,8 s   (14/08)
 *
 * A cota oficial do SWA (15.000 arquivos / 250 MB) não descreve esse limite — o build
 * de 6.050 estava dentro dela e ainda assim não publicou.
 *
 * Orçamento: 118 não-HTML + 13 estáticas + 1 (404.html) + 26 estados + 987 cidades
 * + 189 intenção = 1.334 fixos. Com 1.900 paróquias → 3.234 arquivos, DENTRO da faixa
 * já provada. 2.000 daria 3.334, que cabe no guard mas sai do território conhecido —
 * subir só depois de um deploy verde, de forma controlada.
 */
export const MAX_PAROQUIAS_PRERENDER = 1900;

/**
 * Paróquias que entram no prerender por CITAÇÃO EXTERNA, não por ranking de qualidade.
 *
 * Estes CEPs estão cadastrados como "site" na ficha do Google Business Profile da
 * própria paróquia, no formato `buscamissa.com.br/detalhes/{CEP}`. Ver a lista irmã
 * (mesma lista) em `app.routes.server.ts` e o guard em `verificar-prerender.mjs`.
 */
export const CEPS_COM_CITACAO_EXTERNA = [
  '02839070', // Santos Apóstolos, São Paulo
  '02810000', // Nossa Senhora das Dores, São Paulo
  '12240540', // Capela Nossa Senhora Aparecida, São José dos Campos
  '11730000', // Nossa Senhora Aparecida, Mongaguá
  '12233401', // Comunidade Imaculado Coração de Maria, São José dos Campos
  '02982170', // Santa Teresinha do Menino Jesus, São Paulo
  '02927000', // Bom Jesus dos Passos, São Paulo
  '02967000', // São Judas Tadeu, São Paulo
  '04187070', // São Bernardo de Claraval, São Paulo
  '12224000', // Capela São Francisco de Assis, São José dos Campos
  '13210580', // São Pedro Apóstolo, Jundiaí
  '02942070', // Nossa Senhora do Retiro, São Paulo
  '02674030', // Santa Cruz, São Paulo
  '02755000', // Santa Luzia, São Paulo
  '12050543', // Comunidade Santa Isabel, Taubaté
  '02856110', // Sagrada Família, São Paulo
];

/** Normaliza CEP para 8 dígitos, como está em CEPS_COM_CITACAO_EXTERNA. */
function normalizarCep(cep) {
  return (cep ?? '').replace(/\D/g, '');
}

/** Ranking de qualidade: confiança desc → nº de missas desc → alteração asc (estável). */
function porQualidade(a, b) {
  return (
    (b.igreja?.statusConfianca ?? 0) - (a.igreja?.statusConfianca ?? 0) ||
    (b.igreja?.missas?.length ?? 0) - (a.igreja?.missas?.length ?? 0) ||
    String(a.igreja?.alteracao ?? '').localeCompare(String(b.igreja?.alteracao ?? ''))
  );
}

/**
 * Escolhe QUAIS paróquias entram no prerender, dentro do teto acima.
 *
 * Duas fases, e a ordem importa:
 *
 *  1. PISO DE DESCOBERTA — a melhor paróquia de CADA cidade. Cobre 100% das cidades,
 *     garantindo que toda página de cidade tenha profundidade real em HTML abaixo
 *     dela. É por essa hierarquia (estado → cidade → paróquia) que o Google desce,
 *     então uma cidade sem nenhuma paróquia assada é um galho morto.
 *  2. RESTO POR QUALIDADE — preenche o que sobra pelo ranking acima.
 *
 * Determinístico: as chaves de cidade são ordenadas antes do corte, então dois builds
 * do mesmo cache selecionam exatamente o mesmo conjunto.
 *
 * Retorna null se o cache não existe (ex.: build:dev sem prebuild) → o caller cai no
 * fallback. Em staging/prod o cache é obrigatório (ver baixar-bulk-prerender.mjs).
 */
export function paroquiasDoDisco() {
  const arquivo = join(process.cwd(), '.prerender-cache', 'paroquias.json');
  if (!existsSync(arquivo)) return null;
  const lista = JSON.parse(readFileSync(arquivo, 'utf-8'));

  // Paróquia sem NENHUM horário não entra: a página não tem o conteúdo que promete.
  // Ela segue em CSR e o details.component aplica `noindex` após a hidratação.
  const elegiveis = lista.filter(
    (p) => p?.uf && p?.cidadeSlug && p?.slug && (p.igreja?.missas?.length ?? 0) > 0,
  );

  // Fase 1 — melhor de cada cidade.
  const melhorPorCidade = new Map();
  for (const p of elegiveis) {
    const chave = `${p.uf}/${p.cidadeSlug}`;
    const atual = melhorPorCidade.get(chave);
    if (!atual || porQualidade(p, atual) < 0) melhorPorCidade.set(chave, p);
  }
  const piso = [...melhorPorCidade.keys()].sort().map((k) => melhorPorCidade.get(k));

  // Fase 1.5 — citação externa (ver CEPS_COM_CITACAO_EXTERNA).
  const noPiso = new Set(piso);
  const porCitacao = elegiveis.filter(
    (p) =>
      !noPiso.has(p) &&
      CEPS_COM_CITACAO_EXTERNA.includes(normalizarCep(p.igreja?.endereco?.cep)),
  );

  // Fase 2 — resto por qualidade.
  const jaEscolhidas = new Set([...piso, ...porCitacao]);
  const resto = elegiveis.filter((p) => !jaEscolhidas.has(p)).sort(porQualidade);

  return [...piso, ...porCitacao, ...resto]
    .slice(0, MAX_PAROQUIAS_PRERENDER)
    .map((p) => ({ uf: p.uf, cidade: p.cidadeSlug, slug: p.slug }));
}
