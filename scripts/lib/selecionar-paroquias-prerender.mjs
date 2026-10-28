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
import { tetoParoquias } from './orcamento-arquivos.mjs';

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
 * Chave de reversão, em dois degraus:
 *  - `PRERENDER_PAROQUIAS_CRITERIO=qualidade` ignora demanda e proteção e volta ao
 *    critério original (resto por qualidade, teto fixo);
 *  - `PRERENDER_PAROQUIAS_CRITERIO=demanda` ignora só o arquivo de proteção e volta à
 *    seleção por demanda com teto fixo (o critério anterior ao V8).
 */
export const VARIAVEL_CRITERIO = 'PRERENDER_PAROQUIAS_CRITERIO';

/**
 * Arquivo versionado que liga o critério V8 (ver `selecionarParoquiasV8`). Gerado fora
 * do build por `scripts/gerar-protecao-prerender.mjs`, a partir do sitemap publicado e
 * do Search Console:
 *
 *   { versao, geradoEm, fontes, cidadesComDemanda: ['uf/cidade'],
 *     atuais: ['uf/cidade/slug'], protegidas: [{ chave, cliques }] }
 *
 * Sem o arquivo (ou com ele inválido) a seleção é a de demanda, como antes.
 */
export const ARQUIVO_PROTECAO = join('scripts', 'data', 'prerender-protecao.json');

/**
 * Capitais (`uf/cidade-slug`). Entram no piso mesmo sem clique na página da cidade: são
 * as cidades em que a falta de profundidade em HTML custaria mais.
 */
export const CAPITAIS = Object.freeze([
  'ac/rio-branco', 'al/maceio', 'am/manaus', 'ap/macapa', 'ba/salvador', 'ce/fortaleza',
  'df/brasilia', 'es/vitoria', 'go/goiania', 'ma/sao-luis', 'mg/belo-horizonte',
  'ms/campo-grande', 'mt/cuiaba', 'pa/belem', 'pb/joao-pessoa', 'pe/recife', 'pi/teresina',
  'pr/curitiba', 'rj/rio-de-janeiro', 'rn/natal', 'ro/porto-velho', 'rr/boa-vista',
  'rs/porto-alegre', 'sc/florianopolis', 'se/aracaju', 'sp/sao-paulo', 'to/palmas',
]);

/**
 * As camadas que o V8 garante (piso + citação + protegidas) não cabem no teto. O build
 * para aqui em vez de cortar páginas protegidas em silêncio.
 */
export class ErroCapacidadePrerender extends Error {
  constructor({ teto, piso, citacao, protegidas, essenciais }) {
    super(
      `[prerender-paroquias] capacidade insuficiente: ${essenciais} páginas obrigatórias ` +
        `(piso ${piso} + citação ${citacao} + protegidas ${protegidas}, sem repetição) ` +
        `para um teto de ${teto}. Nenhuma página protegida foi removida. Saídas: medir a ` +
        `distribuição real e rever MAX_FILES, ou regenerar ${ARQUIVO_PROTECAO}.`,
    );
    this.name = 'ErroCapacidadePrerender';
    Object.assign(this, { teto, piso, citacao, protegidas, essenciais });
  }
}

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
 * Seleção V8 — o crescimento de cidades não pode consumir as vagas de paróquia nem
 * estourar o orçamento de arquivos, e nenhuma página com tráfego sai do prerender.
 *
 * Ordem:
 *  1. PISO ESTREITO — a melhor paróquia (por qualidade) só das capitais e das cidades
 *     em `protecao.cidadesComDemanda` (página da cidade com clique no Search Console).
 *     Uma cidade nova sem demanda já tem a própria página prerenderizada, que linka
 *     todas as paróquias; não leva também uma vaga de paróquia.
 *  2. CITAÇÃO EXTERNA — como antes.
 *  3. PROTEGIDAS — páginas já prerenderizadas com clique (`protecao.protegidas`).
 *  4. DEMANDA — a ordem do arquivo de demanda.
 *  5. PERMANÊNCIA — as páginas já prerenderizadas (`protecao.atuais`), para não trocar
 *     sem motivo uma página que já tem HTML e canonical.
 *  6. QUALIDADE — o que sobrar.
 *
 * O `teto` vem de `tetoParoquias` (orçamento de arquivos), não da constante fixa. Se as
 * camadas 1–3 não couberem, lança `ErroCapacidadePrerender`.
 */
export function selecionarParoquiasV8(lista, { protecao, demanda = null, teto }) {
  const elegiveis = elegiveisParaPrerender(lista);
  const porChave = new Map(elegiveis.map((p) => [chaveParoquia(p), p]));

  const cidadesPiso = new Set([...CAPITAIS, ...(protecao.cidadesComDemanda ?? [])]);
  const { piso: pisoCompleto } = camadasFixas(elegiveis);
  const piso = pisoCompleto.filter((p) =>
    cidadesPiso.has(`${String(p.uf).toLowerCase()}/${p.cidadeSlug}`),
  );
  // Citação recalculada contra o piso ESTREITO: a citada que era a melhor da cidade saía
  // da citação por já estar no piso completo e, sem isto, ficaria de fora das duas.
  const noPiso = new Set(piso);
  const porCitacao = elegiveis.filter(
    (p) => !noPiso.has(p) && CEPS_COM_CITACAO_EXTERNA.includes(normalizarCep(p.igreja?.endereco?.cep)),
  );

  const escolhidas = [];
  const vistas = new Set();
  const incluir = (p) => {
    if (p && !vistas.has(p)) {
      vistas.add(p);
      escolhidas.push(p);
    }
  };
  piso.forEach(incluir);
  porCitacao.forEach(incluir);
  for (const { chave } of protecao.protegidas ?? []) incluir(porChave.get(chave));

  const essenciais = escolhidas.length;
  if (essenciais > teto) {
    throw new ErroCapacidadePrerender({
      teto,
      piso: piso.length,
      citacao: porCitacao.length,
      protegidas: (protecao.protegidas ?? []).length,
      essenciais,
    });
  }

  for (const c of demanda ?? []) incluir(porChave.get(c));
  for (const c of protecao.atuais ?? []) incluir(porChave.get(c));
  elegiveis.filter((p) => !vistas.has(p)).sort(porQualidade).forEach(incluir);

  return escolhidas
    .slice(0, Math.max(teto, 0))
    .map((p) => ({ uf: p.uf, cidade: p.cidadeSlug, slug: p.slug }));
}

/**
 * Lê `ARQUIVO_PROTECAO`. Devolve `null` — e a seleção fica na de demanda — quando a
 * variável de reversão pede (`qualidade` ou `demanda`), quando o arquivo não existe ou
 * quando ele é inválido. Como `lerDemanda`, um arquivo ruim nunca derruba o build.
 */
export function lerProtecao(base = process.cwd(), env = process.env) {
  if (env[VARIAVEL_CRITERIO] === 'qualidade' || env[VARIAVEL_CRITERIO] === 'demanda') return null;
  const arquivo = join(base, ARQUIVO_PROTECAO);
  if (!existsSync(arquivo)) return null;
  try {
    const dados = JSON.parse(readFileSync(arquivo, 'utf-8'));
    const listaDeTexto = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string');
    if (!listaDeTexto(dados?.cidadesComDemanda) || !listaDeTexto(dados?.atuais)) return null;
    if (!Array.isArray(dados?.protegidas) || !dados.protegidas.every((x) => typeof x?.chave === 'string')) {
      return null;
    }
    return dados;
  } catch {
    return null;
  }
}

/** Critério que o build vai usar, para o log do sitemap e para o guard. */
export function criterioAtivo(base = process.cwd(), env = process.env) {
  if (lerProtecao(base, env)) return 'v8';
  return lerDemanda(base, env) ? 'demanda' : 'qualidade';
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
 * Páginas de cidade que o build vai gerar — a mesma regra de `cidadesDoDisco` em
 * `app.routes.server.ts` e da seção "missas" de `verificar-prerender.mjs`.
 */
export function contarCidades(cidades) {
  return cidades.filter((c) => c?.uf && c?.cidadeSlug).length;
}

/**
 * Seleção do build, a partir do cache do prebuild e dos arquivos de demanda e proteção.
 *
 * Retorna null se o cache não existe (ex.: build:dev sem prebuild) → o caller cai no
 * fallback. Em staging/prod o cache é obrigatório (ver baixar-bulk-prerender.mjs). No
 * critério V8 o teto depende de `cidades.json`; sem ele não há como respeitar o
 * orçamento, e a seleção falha em vez de adivinhar.
 */
export function paroquiasDoDisco(base = process.cwd(), env = process.env) {
  const arquivo = join(base, '.prerender-cache', 'paroquias.json');
  if (!existsSync(arquivo)) return null;
  const lista = JSON.parse(readFileSync(arquivo, 'utf-8'));
  const demanda = lerDemanda(base, env);
  const protecao = lerProtecao(base, env);
  if (!protecao) return selecionarParoquias(lista, { demanda });

  const arquivoCidades = join(base, '.prerender-cache', 'cidades.json');
  if (!existsSync(arquivoCidades)) {
    throw new Error(
      `[prerender-paroquias] critério V8 sem .prerender-cache/cidades.json: o teto de paróquias depende do número de cidades.`,
    );
  }
  const cidades = contarCidades(JSON.parse(readFileSync(arquivoCidades, 'utf-8')));
  return selecionarParoquiasV8(lista, { protecao, demanda, teto: tetoParoquias({ cidades }) });
}
