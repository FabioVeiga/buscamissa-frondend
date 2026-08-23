import { RenderMode, ServerRoute } from '@angular/ssr';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { environment } from '../environments/environment';
// Fonte única das rotas de SEO, compartilhada com scripts/gerar-sitemap.mjs.
// É um módulo .mjs plano (roda também como script Node standalone), por isso o
// type-checker não tem declaração — o esbuild do build server o empacota normalmente.
// @ts-expect-error — módulo JS sem tipos; contrato garantido pelo próprio helper.
import { buscarRotasSeo, normalizarBaseUrl } from '../../scripts/lib/seo-routes.mjs';

/**
 * Migração SSR/SSG (Auditoria2), em fases sobre `outputMode: static`:
 *
 * - Fase 1 (em produção): prerender das 8 páginas de conteúdo estático — texto
 *   fixo, sem :param e sem dados da API.
 * - Fase 2: prerender das páginas de CIDADE (`/missas/:uf/:cidade`) via
 *   `getPrerenderParams`, alimentado por `/v2/seo/routes` (mesmo endpoint do
 *   sitemap).
 * - Fase 2.5 (aqui): prerender das páginas de PARÓQUIA (`/paroquia/:uf/:cidade/:slug`).
 *   O bulk `/v2/seo/paroquias` (interceptor só-server) evita as chamadas individuais.
 *   Prerenderiza um SUBCONJUNTO das paróquias, sob teto (ver paroquiasDoDisco).
 *
 *   Em 2026-08-13 o filtro foi removido para prerenderizar todas as 4.727: no SWA
 *   "sem arquivo = 404", então cobertura total era o que permitia 404 real em
 *   `/paroquia/*`. Só que 4.717 paróquias = 6.050 arquivos, e o deploy em master
 *   morreu no timeout de 300 s da distribuição de conteúdo do SWA (2026-08-14).
 *
 *   Decisão de 2026-08-23: cabe no teto da plataforma e abre mão do 404 de paróquia.
 *   `/paroquia/*` volta ao `navigationFallback` (shell CSR em 200, SEM canonical), e
 *   `/missas/*` continua fora dele — lá o universo é pequeno e 100% prerenderizado,
 *   então o 404 real se sustenta. O ganho maior de SEO não depende disso: é o
 *   fallback ter deixado de ser a HOME prerenderizada com `canonical=/home`.
 */

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
const MAX_PAROQUIAS_PRERENDER = 1900;

/** Ranking de qualidade: confiança desc → nº de missas desc → alteração asc (estável). */
function porQualidade(a: ParoquiaCache, b: ParoquiaCache): number {
  return (
    (b.igreja?.statusConfianca ?? 0) - (a.igreja?.statusConfianca ?? 0) ||
    (b.igreja?.missas?.length ?? 0) - (a.igreja?.missas?.length ?? 0) ||
    String(a.igreja?.alteracao ?? '').localeCompare(String(b.igreja?.alteracao ?? ''))
  );
}

interface ParoquiaCache {
  uf: string;
  cidadeSlug: string;
  slug: string;
  igreja?: { missas?: unknown[]; statusConfianca?: number; alteracao?: string };
}

/**
 * Escolhe QUAIS paróquias entram no prerender, dentro do teto acima.
 *
 * Duas fases, e a ordem importa:
 *
 *  1. PISO DE DESCOBERTA — a melhor paróquia de CADA cidade. Cobre 100% das 802
 *     cidades, garantindo que toda página de cidade tenha profundidade real em HTML
 *     abaixo dela. É por essa hierarquia (estado → cidade → paróquia) que o Google
 *     desce, então uma cidade sem nenhuma paróquia assada é um galho morto.
 *  2. RESTO POR QUALIDADE — preenche o que sobra pelo ranking acima.
 *
 * Por que não ordenar só por qualidade: medido contra os dados reais de produção, o
 * ranking global puro dava fome geográfica. O RS ficava com 17 de 177 paróquias (9,6%)
 * e AL com 1 de 8, só porque a base desses estados tem confiança mais baixa — enquanto
 * SP levava 36% de todo o orçamento. Com o piso por cidade o RS sobe para 24%, a
 * cobertura de cidades vai de 71% para 100%, e ainda assim 96,8% das selecionadas têm
 * confiança Média/Alta. Round-robin por UF foi descartado por trocar isso por SP em
 * 9,6%, que é pior negócio.
 *
 * Determinístico: as chaves de cidade são ordenadas antes do corte, então dois builds
 * do mesmo cache selecionam exatamente o mesmo conjunto.
 *
 * Retorna null se o cache não existe (ex.: build:dev sem prebuild) → o caller cai no
 * fallback. Em staging/prod o cache é obrigatório (ver baixar-bulk-prerender.mjs).
 */
function paroquiasDoDisco(): Array<{ uf: string; cidade: string; slug: string }> | null {
  const arquivo = join(process.cwd(), '.prerender-cache', 'paroquias.json');
  if (!existsSync(arquivo)) return null;
  const lista = JSON.parse(readFileSync(arquivo, 'utf-8')) as ParoquiaCache[];

  // Paróquia sem NENHUM horário não entra: a página não tem o conteúdo que promete.
  // Ela segue em CSR e o details.component aplica `noindex` após a hidratação.
  const elegiveis = lista.filter(
    (p) => p?.uf && p?.cidadeSlug && p?.slug && (p.igreja?.missas?.length ?? 0) > 0,
  );

  // Fase 1 — melhor de cada cidade.
  const melhorPorCidade = new Map<string, ParoquiaCache>();
  for (const p of elegiveis) {
    const chave = `${p.uf}/${p.cidadeSlug}`;
    const atual = melhorPorCidade.get(chave);
    if (!atual || porQualidade(p, atual) < 0) melhorPorCidade.set(chave, p);
  }
  const piso = [...melhorPorCidade.keys()].sort().map((k) => melhorPorCidade.get(k)!);

  // Fase 2 — resto por qualidade.
  const jaEscolhidas = new Set(piso);
  const resto = elegiveis.filter((p) => !jaEscolhidas.has(p)).sort(porQualidade);

  return [...piso, ...resto]
    .slice(0, MAX_PAROQUIAS_PRERENDER)
    .map((p) => ({ uf: p.uf, cidade: p.cidadeSlug, slug: p.slug }));
}

// --- Fase 3 SEO: Estado + árvore de Intenção -------------------------------

// Dias explícitos da intenção. "hoje" NÃO é prerenderizado (depende do fuso do
// usuário → redirect client-side). Slugs iguais ao DiaDaSemanaHelper do backend.
const DIAS_INTENCAO = ['domingo', 'segunda-feira', 'terca-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sabado'];

/** Lê um JSON do cache do prebuild; null se não existir (ex.: build:dev). */
function lerCache<T>(arquivo: string): T | null {
  const caminho = join(process.cwd(), '.prerender-cache', arquivo);
  if (!existsSync(caminho)) return null;
  return JSON.parse(readFileSync(caminho, 'utf-8')) as T;
}

/**
 * Cidades a prerenderizar, do cache do prebuild (.prerender-cache/cidades.json —
 * o MESMO arquivo que o PrerenderCidadeInterceptor já consome para servir os dados
 * do disco). Retorna null se o arquivo não existe (ex.: build:dev sem prebuild).
 *
 * Por que disco e não `/v2/seo/routes`: esta era a ÚNICA categoria cujo
 * getPrerenderParams dependia de rede no meio do build, com timeout de 8s
 * (scripts/lib/seo-routes.mjs). Quando esse fetch degradava, `buscarRotasSeo`
 * devolvia `{cities: []}` — silenciosamente, porque o fallback vazio é by design e
 * o guard-rail não falha com zero páginas numa seção. Resultado observado em
 * produção (2026-08-13): ZERO das 988 páginas `/missas/{uf}/{cidade}` estavam
 * prerenderizadas; todas caíam no fallback do proxy, que devolve o HTML da HOME
 * (200, canonical=/home) — a causa direta dos "Duplicate, Google chose different
 * canonical" e do "Discovered - currently not indexed" no Search Console.
 *
 * Paróquias e estados já liam do disco e por isso nunca sofreram esse problema.
 */
function cidadesDoDisco(): Array<{ uf: string; cidade: string }> | null {
  const lista = lerCache<Array<{ uf?: string; cidadeSlug?: string }>>('cidades.json');
  if (!lista) return null;
  return lista
    .filter((c) => c?.uf && c?.cidadeSlug)
    .map((c) => ({ uf: c.uf!.toLowerCase(), cidade: c.cidadeSlug! }));
}

/** UFs (lowercase) que têm paróquia — do cache estados.json, senão do bulk ao vivo. */
async function ufsParaPrerender(): Promise<Array<{ uf: string }>> {
  let lista = lerCache<Array<{ uf: string }>>('estados.json');
  if (!lista) {
    const base = normalizarBaseUrl(environment.config.apiURL);
    try {
      const res = await fetch(`${base}/v2/seo/estados`);
      lista = res.ok ? ((await res.json()) as Array<{ uf: string }>) : [];
    } catch {
      lista = [];
    }
  }
  return (Array.isArray(lista) ? lista : []).filter((e) => e?.uf).map((e) => ({ uf: e.uf.toLowerCase() }));
}

interface ArvoreDia {
  estados?: Array<{ uf: string; cidades?: Array<{ cidadeSlug: string }> }>;
}

/** Árvore de um dia — do cache missa-{dia}.json, senão do bulk ao vivo (build:dev). */
async function arvoreDoDia(dia: string): Promise<ArvoreDia> {
  const cache = lerCache<ArvoreDia>(`missa-${dia}.json`);
  if (cache) return cache;
  const base = normalizarBaseUrl(environment.config.apiURL);
  try {
    const res = await fetch(`${base}/v2/seo/missa-dia/${dia}`);
    return res.ok ? ((await res.json()) as ArvoreDia) : {};
  } catch {
    return {};
  }
}

// Rotas por dia: nacional (sem param), UF e cidade (com getPrerenderParams).
// Só entram UF/cidade com ≥1 missa no dia (a árvore já vem filtrada pelo backend).
const rotasIntencao: ServerRoute[] = DIAS_INTENCAO.flatMap((dia) => [
  { path: `missa-${dia}`, renderMode: RenderMode.Prerender },
  {
    path: `missa-${dia}/:uf`,
    renderMode: RenderMode.Prerender,
    getPrerenderParams: async () => {
      const arvore = await arvoreDoDia(dia);
      return (arvore.estados ?? [])
        .filter((e) => e?.uf)
        .map((e) => ({ uf: e.uf.toLowerCase() }));
    },
  },
  // Folha cidade (`/missa-{dia}/:uf/:cidade`): CSR, não prerender. Long-tail de
  // baixíssimo volume de busca por combinação — os hubs nacional/UF acima já
  // cobrem o SEO principal. Prerenderizar as ~2.937 combinações estourava o
  // limite de tamanho do Azure SWA (~300 MB só desta categoria). O componente
  // busca os dados via SeoPaginasService normalmente, então funciona em CSR puro.
  { path: `missa-${dia}/:uf/:cidade`, renderMode: RenderMode.Client },
]);

export const serverRoutes: ServerRoute[] = [
  { path: 'como-funciona', renderMode: RenderMode.Prerender },
  { path: 'guia-responsavel', renderMode: RenderMode.Prerender },
  { path: 'contribuir', renderMode: RenderMode.Prerender },
  { path: 'anuncios', renderMode: RenderMode.Prerender },
  { path: 'solicitar', renderMode: RenderMode.Prerender },
  { path: 'termos', renderMode: RenderMode.Prerender },
  { path: 'privacidade', renderMode: RenderMode.Prerender },
  { path: 'cookies', renderMode: RenderMode.Prerender },

  // Fase 2 — cidades. As chaves (uf/cidade) casam com os :param de app.routes.ts.
  // Preferimos o cache do prebuild (mesma fonte do PrerenderCidadeInterceptor);
  // sem ele (build:dev) caímos em `/v2/seo/routes`. Se ambos falharem, a lista
  // vem vazia (segue CSR) em vez de derrubar o deploy — mas o guard-rail do
  // postbuild agora barra o deploy nesse caso (ver verificar-prerender.mjs).
  {
    path: 'missas/:uf/:cidade',
    renderMode: RenderMode.Prerender,
    getPrerenderParams: async () => {
      const doDisco = cidadesDoDisco();
      if (doDisco) return doDisco;
      const base = normalizarBaseUrl(environment.config.apiURL);
      const { cities } = await buscarRotasSeo(base);
      return cities.map((c: { uf: string; citySlug: string }) => ({
        uf: c.uf,
        cidade: c.citySlug,
      }));
    },
  },

  // Fase 2.5 — paróquias (TODAS). As chaves (uf/cidade/slug) casam com os :param de
  // app.routes.ts. Preferimos o cache do prebuild; sem ele (build:dev) ou se
  // `/v2/seo/routes` falhar, cai no fallback (lista vazia) — nunca derruba o deploy.
  {
    path: 'paroquia/:uf/:cidade/:slug',
    renderMode: RenderMode.Prerender,
    getPrerenderParams: async () => {
      const doDisco = paroquiasDoDisco();
      if (doDisco) return doDisco;
      const base = normalizarBaseUrl(environment.config.apiURL);
      const { parishes } = await buscarRotasSeo(base);
      return parishes.map((p: { uf: string; citySlug: string; slug: string }) => ({
        uf: p.uf,
        cidade: p.citySlug,
        slug: p.slug,
      }));
    },
  },

  // Índice de estados (`/estados`) — estático (constante STATES), sem :param.
  { path: 'estados', renderMode: RenderMode.Prerender },

  // Índice de cidades (`/cidades`) — mesma fonte/interceptor de `/estados`
  // (`PrerenderEstadosInterceptor`, agora com `cidades[]` no resumo). Antes CSR
  // (caía no `**` abaixo): era o hub com mais links internos (381 cidades) e o
  // único sem HTML prerenderizado nem JSON-LD.
  { path: 'cidades', renderMode: RenderMode.Prerender },

  // Índice de dias (`/dias`) — estático (constante DIAS_INTENCAO), sem :param.
  { path: 'dias', renderMode: RenderMode.Prerender },

  // Fase 3 — Estado (`/missas/:uf`). getPrerenderParams do cache estados.json
  // (fallback: bulk ao vivo). Vem ANTES de 'missas/:uf/:cidade' (menos segmentos).
  {
    path: 'missas/:uf',
    renderMode: RenderMode.Prerender,
    getPrerenderParams: async () => ufsParaPrerender(),
  },

  // Fase 3 — árvore de INTENÇÃO por dia (`/missa-{dia}[/:uf[/:cidade]]`), 7 dias.
  ...rotasIntencao,

  // `/missa-hoje` NÃO é prerenderizado: resolve o dia local no browser e redireciona
  // pro dia explícito (Brasil tem 4 fusos). Segue CSR.
  { path: 'missa-hoje', renderMode: RenderMode.Client },

  // Fase 3 — HOME (página de maior tráfego e pior CWV). Sem :param → sem
  // getPrerenderParams. A home guarda navigator/document/geo com isPlatformBrowser
  // (o server assa o estado default estável; o browser faz o upgrade ao hidratar).
  // Precisa vir ANTES do '**'. A raiz '' redireciona p/ home mas também é assada.
  { path: 'home', renderMode: RenderMode.Prerender },
  { path: '', renderMode: RenderMode.Prerender },

  // Tudo o mais (busca, área logada, rotas legadas) segue CSR.
  { path: '**', renderMode: RenderMode.Client },
];
