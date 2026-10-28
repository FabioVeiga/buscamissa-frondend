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

/**
 * Arquivo versionado com a ordem de DEMANDA das paróquias do "resto" (impressões no
 * Search Console). Gerado fora do build por `scripts/atualizar-demanda-paroquias.mjs`,
 * que aplica as regras de entrada/saída (margem, permanência mínima, teto de trocas).
 * O build só LÊ — dois builds do mesmo cache e do mesmo arquivo selecionam o mesmo
 * conjunto.
 */
export const ARQUIVO_DEMANDA = join('scripts', 'data', 'paroquias-demanda.json');

/**
 * Chave de reversão: `PRERENDER_PAROQUIAS_CRITERIO=qualidade` ignora o arquivo de
 * demanda e volta ao critério anterior (resto por qualidade) sem mexer na lista.
 */
export const VARIAVEL_CRITERIO = 'PRERENDER_PAROQUIAS_CRITERIO';

/** Normaliza CEP para 8 dígitos, como está em CEPS_COM_CITACAO_EXTERNA. */
function normalizarCep(cep) {
  return (cep ?? '').replace(/\D/g, '');
}

/** Chave estável de uma paróquia, igual ao caminho `/paroquia/{uf}/{cidade}/{slug}`. */
export function chaveParoquia(p) {
  return `${String(p.uf).toLowerCase()}/${p.cidadeSlug}/${p.slug}`;
}

/** Ranking de qualidade: confiança desc → nº de missas desc → alteração asc (estável). */
export function porQualidade(a, b) {
  return (
    (b.igreja?.statusConfianca ?? 0) - (a.igreja?.statusConfianca ?? 0) ||
    (b.igreja?.missas?.length ?? 0) - (a.igreja?.missas?.length ?? 0) ||
    String(a.igreja?.alteracao ?? '').localeCompare(String(b.igreja?.alteracao ?? ''))
  );
}

/**
 * Paróquia sem NENHUM horário não entra: a página não tem o conteúdo que promete.
 * Ela segue em CSR e o details.component aplica `noindex` após a hidratação.
 */
export function elegiveisParaPrerender(lista) {
  return lista.filter(
    (p) => p?.uf && p?.cidadeSlug && p?.slug && (p.igreja?.missas?.length ?? 0) > 0,
  );
}

/**
 * As duas camadas FIXAS da seleção, que nunca disputam vaga com o resto:
 *
 *  1. PISO DE DESCOBERTA — a melhor paróquia (por qualidade) de CADA cidade. Cobre
 *     100% das cidades, garantindo que toda página de cidade tenha profundidade real
 *     em HTML abaixo dela. É por essa hierarquia (estado → cidade → paróquia) que o
 *     Google desce, então uma cidade sem nenhuma paróquia assada é um galho morto.
 *  2. CITAÇÃO EXTERNA — ver CEPS_COM_CITACAO_EXTERNA.
 *
 * Também usada pelo gerador do arquivo de demanda, para saber quantas vagas sobram.
 */
export function camadasFixas(elegiveis) {
  const melhorPorCidade = new Map();
  for (const p of elegiveis) {
    const chave = `${p.uf}/${p.cidadeSlug}`;
    const atual = melhorPorCidade.get(chave);
    if (!atual || porQualidade(p, atual) < 0) melhorPorCidade.set(chave, p);
  }
  const piso = [...melhorPorCidade.keys()].sort().map((k) => melhorPorCidade.get(k));

  const noPiso = new Set(piso);
  const porCitacao = elegiveis.filter(
    (p) =>
      !noPiso.has(p) &&
      CEPS_COM_CITACAO_EXTERNA.includes(normalizarCep(p.igreja?.endereco?.cep)),
  );
  return { piso, porCitacao };
}

/**
 * Escolhe QUAIS paróquias entram no prerender, dentro do teto. Função pura.
 *
 * Ordem: piso → citação externa → RESTO. O resto segue a ordem de `demanda` (lista
 * de chaves `uf/cidade/slug`), pulando o que não é elegível ou já está nas camadas
 * fixas; as vagas que sobrarem são preenchidas por qualidade, como antes. Com
 * `demanda` null o resultado é exatamente o critério anterior (resto por qualidade).
 *
 * Determinístico: as chaves de cidade são ordenadas antes do corte, e a demanda vem
 * de um arquivo versionado.
 */
export function selecionarParoquias(lista, { demanda = null, teto = MAX_PAROQUIAS_PRERENDER } = {}) {
  const elegiveis = elegiveisParaPrerender(lista);
  const { piso, porCitacao } = camadasFixas(elegiveis);

  const jaEscolhidas = new Set([...piso, ...porCitacao]);
  const porChave = new Map(elegiveis.map((p) => [chaveParoquia(p), p]));

  const porDemanda = [];
  for (const chave of demanda ?? []) {
    const p = porChave.get(chave);
    if (p && !jaEscolhidas.has(p)) {
      porDemanda.push(p);
      jaEscolhidas.add(p);
    }
  }
  const porQualidadeRestante = elegiveis.filter((p) => !jaEscolhidas.has(p)).sort(porQualidade);

  return [...piso, ...porCitacao, ...porDemanda, ...porQualidadeRestante]
    .slice(0, teto)
    .map((p) => ({ uf: p.uf, cidade: p.cidadeSlug, slug: p.slug }));
}

/**
 * Lê a ordem de demanda de `ARQUIVO_DEMANDA`. Devolve `null` — e a seleção volta ao
 * critério de qualidade — quando a variável de reversão pede, quando o arquivo não
 * existe ou quando ele é inválido. Nunca derruba o build: a pior consequência de um
 * arquivo ruim é o critério anterior.
 */
export function lerDemanda(base = process.cwd(), env = process.env) {
  if (env[VARIAVEL_CRITERIO] === 'qualidade') return null;
  const arquivo = join(base, ARQUIVO_DEMANDA);
  if (!existsSync(arquivo)) return null;
  try {
    const dados = JSON.parse(readFileSync(arquivo, 'utf-8'));
    if (!Array.isArray(dados?.resto)) return null;
    return dados.resto.map((r) => r?.chave).filter((c) => typeof c === 'string');
  } catch {
    return null;
  }
}

/**
 * Seleção do build, a partir do cache do prebuild e do arquivo de demanda.
 *
 * Retorna null se o cache não existe (ex.: build:dev sem prebuild) → o caller cai no
 * fallback. Em staging/prod o cache é obrigatório (ver baixar-bulk-prerender.mjs).
 */
export function paroquiasDoDisco() {
  const arquivo = join(process.cwd(), '.prerender-cache', 'paroquias.json');
  if (!existsSync(arquivo)) return null;
  const lista = JSON.parse(readFileSync(arquivo, 'utf-8'));
  return selecionarParoquias(lista, { demanda: lerDemanda() });
}
