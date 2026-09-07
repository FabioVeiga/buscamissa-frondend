import { RenderMode, ServerRoute } from '@angular/ssr';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { environment } from '../environments/environment';
// Fonte única das rotas de SEO, compartilhada com scripts/gerar-sitemap.mjs.
// É um módulo .mjs plano (roda também como script Node standalone), por isso o
// type-checker não tem declaração — o esbuild do build server o empacota normalmente.
// @ts-expect-error — módulo JS sem tipos; contrato garantido pelo próprio helper.
import { buscarRotasSeo, normalizarBaseUrl } from '../../scripts/lib/seo-routes.mjs';
// Fonte única da SELEÇÃO de paróquias prerenderizadas, compartilhada com
// scripts/gerar-sitemap.mjs (que a usa para filtrar o sitemap pela cobertura real).
// @ts-expect-error — módulo JS sem tipos; contrato garantido pelo próprio helper.
import { paroquiasDoDisco } from '../../scripts/lib/selecionar-paroquias-prerender.mjs';

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
 * MAX_PAROQUIAS_PRERENDER, CEPS_COM_CITACAO_EXTERNA e paroquiasDoDisco() moraram
 * aqui até 2026-09-07 — extraídos para scripts/lib/selecionar-paroquias-prerender.mjs
 * (mesmo algoritmo, mesmo resultado) para serem reaproveitados por
 * scripts/gerar-sitemap.mjs, que filtra o sitemap pela cobertura real de prerender.
 */

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

  // `/missa-agora` — primeira landing de INTENÇÃO prerenderizada.
  //
  // Por quê: medido no Search Console (1.000 queries, filtro /paroquia/, 3 meses),
  // busca por INTENÇÃO ("missa perto de mim", "horário de missa") converte a 3,02%
  // de CTR contra 1,79% de busca por NOME de igreja — 1,69× melhor, mesmo em posição
  // pior. Nome de igreja disputa com o Knowledge Panel do Google; intenção não.
  //
  // O conteúdo indexável JÁ existia no template (h1, subtítulo, cidades, FAQ) e
  // nunca chegava ao crawler: sem esta linha a rota caía no '**' → CSR → o Google
  // recebia o mesmo index.csr.html de 5.685 bytes, sem canonical, sem h1.
  //
  // O que o SERVER assa é o estado neutro ("Usar minha localização"), porque
  // GeolocationService rejeita sem `navigator` e metricas/favorites têm guard de
  // browser. Nada de geolocalização, mapa ou busca muda: o browser hidrata por cima
  // e faz o upgrade. Pré-requisito que tornou isto possível: o relógio do
  // missa-agora.component passou a rodar só no browser e fora da zona — um
  // setInterval sem guard derrubaria este prerender no build.
  { path: 'missa-agora', renderMode: RenderMode.Prerender },

  // Fase 3 — HOME (página de maior tráfego e pior CWV). Sem :param → sem
  // getPrerenderParams. A home guarda navigator/document/geo com isPlatformBrowser
  // (o server assa o estado default estável; o browser faz o upgrade ao hidratar).
  // Precisa vir ANTES do '**'. A raiz '' redireciona p/ home mas também é assada.
  { path: 'home', renderMode: RenderMode.Prerender },
  { path: '', renderMode: RenderMode.Prerender },

  // Tudo o mais (busca, área logada, rotas legadas) segue CSR.
  { path: '**', renderMode: RenderMode.Client },
];
