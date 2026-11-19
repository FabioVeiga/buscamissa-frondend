/**
 * Lógica do Worker de resolução de rotas HTML do BuscaMissa. O entrypoint é
 * `worker.mjs`, que só pode exportar handlers; constantes e utilitários usados
 * também pelo publicador (chave de cache para a purga) ficam aqui.
 *
 * Fluxo por requisição:
 *   classificar(path) → [ler manifesto da cidade] → resolver() → executar decisão
 *
 * Princípio da migração: **na dúvida, origem**. Sem manifesto, manifesto
 * ilegível, Blob fora do ar ou arquivo referenciado ausente, a requisição segue
 * para a origem (SWA), que é exatamente o comportamento de hoje. O Worker só
 * responde por conta própria quando tem um manifesto válido que diz o que fazer,
 * ou quando a URL é malformada (404) ou não canônica (301).
 *
 * Variáveis (wrangler):
 *   BLOB_BASE   URL do contêiner, sem barra final: https://conta.blob.core.windows.net/publicacao
 *   BLOB_SAS    segredo: query string SAS só de leitura, sem "?" (wrangler secret)
 *   ORIGEM      opcional: URL da origem para o fallback (hostname de teste). Sem ela,
 *               o fallback é `fetch(request)`, ou seja, a origem da própria zona.
 *   ROTAS       "paroquia" (padrão) ou "paroquia,cidade"
 */
import { caminhoManifesto, criarLeitorComMemoria } from './manifesto.mjs';
import { classificar } from './rotas.mjs';
import { resolver } from './resolver.mjs';

/** TTL do manifesto no cache da borda (segundos). Converge a ativação sem depender da purga. */
export const TTL_MANIFESTO_S = 30;
/** HTML versionado é imutável: pode ficar no cache da borda indefinidamente. */
export const TTL_HTML_S = 365 * 24 * 3600;

/**
 * Cache-Control público. HTML e 404 repetem o que o SWA de produção envia hoje
 * (medido em 13/11/2026), para a migração não mudar o tempo que o navegador
 * segura uma página. Os 301 do SWA saem sem Cache-Control; aqui ficam 1 h, para
 * que um redirecionamento desfeito não fique preso no navegador indefinidamente.
 */
export const CACHE_HTML = 'public, must-revalidate, max-age=30';
export const CACHE_NAO_ENCONTRADA = CACHE_HTML;
export const CACHE_REDIRECIONAMENTO = 'public, max-age=3600';

/** Página de 404 da origem (`public/404.html`, a mesma do `responseOverrides` do SWA). */
export const CAMINHO_PAGINA_404 = '/404.html';
/** Cópia da página de 404 no cache da borda. Erros da origem não são guardados. */
export const TTL_PAGINA_404_S = 300;

/**
 * Cabeçalhos copiados da resposta da origem para o 404: os de segurança do
 * `globalHeaders` do SWA e o tipo de conteúdo. Cache-Control e X-Robots-Tag são
 * sempre os do Worker.
 */
const CABECALHOS_PAGINA_404 = [
  'content-type',
  'strict-transport-security',
  'x-content-type-options',
  'x-frame-options',
  'referrer-policy',
  'permissions-policy',
  'content-security-policy',
  'content-security-policy-report-only',
  'x-xss-protection',
  'x-dns-prefetch-control',
];

const MARCA_AUSENTE = 'x-bm-ausente';

/** Memória do isolate: texto idêntico não é reparseado nem revalidado. */
const lerManifestoMemorizado = criarLeitorComMemoria();

/**
 * Chave de cache (Cache API) de um blob, sob o próprio hostname para que a purga
 * por URL da zona funcione. O publicador purga `chaveCacheBlob(host, caminhoManifesto(uf, cidade))`
 * depois de ativar. A SAS nunca entra na chave.
 */
export function chaveCacheBlob(host, caminho) {
  return `https://${host}/__bm/blob/${caminho}`;
}

export async function atender(request, env, ctx) {
  const url = new URL(request.url);

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return irParaOrigem(request, env, 'metodo');
  }

  const rota = classificar(url.pathname, { cidades: rotasAtivas(env).has('cidade') });
  if (rota.tipo === 'fora') return irParaOrigem(request, env, 'rota-fora');

  let manifesto = null;
  if (rota.tipo === 'paroquia' || rota.tipo === 'cidade') {
    const lido = await lerManifestoDaCidade(env, ctx, url.host, rota.uf, rota.cidade);
    if (lido.estado === 'erro') return irParaOrigem(request, env, lido.motivo);
    manifesto = lido.manifesto; // null quando ausente
  }

  const decisao = resolver(rota, manifesto);
  const cabecalhosBase = cabecalhosRastreio(manifesto, decisao.acao);

  switch (decisao.acao) {
    case 'origem':
      return irParaOrigem(request, env, decisao.motivo);

    case 'redirecionar': {
      const destino = new URL(decisao.destino, url.origin);
      destino.search = url.search;
      const h = new Headers(cabecalhosBase);
      h.set('Location', destino.toString());
      h.set('Cache-Control', CACHE_REDIRECIONAMENTO);
      return new Response(null, { status: decisao.status, headers: h });
    }

    case 'html':
    case 'shell': {
      const blob = await lerBlob(env, ctx, url.host, decisao.arquivo, TTL_HTML_S);
      if (blob.estado !== 'ok') {
        // Manifesto aponta para arquivo que não existe (ou Blob instável): defeito do
        // publicador. Origem atende enquanto alguém investiga.
        registrar('arquivo-indisponivel', { arquivo: decisao.arquivo, estado: blob.estado });
        return irParaOrigem(request, env, 'arquivo-indisponivel');
      }
      const h = new Headers(cabecalhosBase);
      h.set('Content-Type', 'text/html; charset=utf-8');
      h.set('Cache-Control', CACHE_HTML);
      if (decisao.acao === 'shell') h.set('X-Robots-Tag', 'noindex');
      return new Response(request.method === 'HEAD' ? null : blob.corpo, { status: 200, headers: h });
    }

    case 'nao-encontrada':
      return responderNaoEncontrada(request, env, ctx, url, cabecalhosBase);

    default:
      return irParaOrigem(request, env, 'decisao-desconhecida');
  }
}

function rotasAtivas(env) {
  const valor = typeof env.ROTAS === 'string' && env.ROTAS.trim() !== '' ? env.ROTAS : 'paroquia';
  return new Set(valor.split(',').map((s) => s.trim()).filter(Boolean));
}

function cabecalhosRastreio(manifesto, acao) {
  const h = { 'x-bm-rota': acao };
  if (manifesto) {
    h['x-bm-execucao'] = manifesto.execucao;
    h['x-bm-versao'] = String(manifesto.versao);
  }
  return h;
}

/**
 * 404 com o corpo de `/404.html` da origem. A resposta é sempre 404 com
 * `noindex`, aconteça o que acontecer na origem: página ausente, erro ou rede
 * fora caem numa página mínima embutida (`x-bm-404: embutida`).
 */
async function responderNaoEncontrada(request, env, ctx, url, cabecalhosBase) {
  const pagina = await lerPagina404(env, ctx, url);
  const h = new Headers();
  if (pagina) {
    for (const nome of CABECALHOS_PAGINA_404) {
      const valor = pagina.headers.get(nome);
      if (valor !== null) h.set(nome, valor);
    }
  } else {
    h.set('Content-Type', 'text/html; charset=utf-8');
    h.set('X-Content-Type-Options', 'nosniff');
  }
  if (!h.has('content-type')) h.set('Content-Type', 'text/html; charset=utf-8');
  for (const [nome, valor] of Object.entries(cabecalhosBase)) h.set(nome, valor);
  h.set('Cache-Control', CACHE_NAO_ENCONTRADA);
  h.set('X-Robots-Tag', 'noindex');
  h.set('x-bm-404', pagina ? 'origem' : 'embutida');

  const corpo = request.method === 'HEAD' ? null : (pagina ? pagina.body : PAGINA_404_MINIMA);
  return new Response(corpo, { status: 404, headers: h });
}

/** @returns {Promise<Response|null>} a página de 404 da origem (status 200) ou null */
async function lerPagina404(env, ctx, url) {
  const cache = globalThis.caches?.default;
  const chave = new Request(`https://${url.host}/__bm/origem${CAMINHO_PAGINA_404}`);
  if (cache) {
    const guardada = await cache.match(chave);
    if (guardada) return guardada;
  }

  const base = typeof env.ORIGEM === 'string' && env.ORIGEM !== '' ? env.ORIGEM : url.origin;
  let resposta;
  try {
    resposta = await fetch(new URL(CAMINHO_PAGINA_404, base).toString(), { method: 'GET' });
  } catch {
    registrar('pagina-404-rede', {});
    return null;
  }
  if (resposta.status !== 200) {
    registrar('pagina-404-status', { status: resposta.status });
    return null;
  }

  const h = new Headers();
  for (const nome of CABECALHOS_PAGINA_404) {
    const valor = resposta.headers.get(nome);
    if (valor !== null) h.set(nome, valor);
  }
  if (!cache) return new Response(resposta.body, { status: 200, headers: h });

  const [paraCache, paraResposta] = resposta.body.tee();
  const guardar = new Headers(h);
  guardar.set('Cache-Control', `max-age=${TTL_PAGINA_404_S}`);
  ctx?.waitUntil?.(cache.put(chave, new Response(paraCache, { status: 200, headers: guardar })));
  return new Response(paraResposta, { status: 200, headers: h });
}

async function irParaOrigem(request, env, motivo) {
  let destino = request;
  if (typeof env.ORIGEM === 'string' && env.ORIGEM !== '') {
    const original = new URL(request.url);
    const alvo = new URL(original.pathname + original.search, env.ORIGEM);
    destino = new Request(alvo.toString(), request);
  }
  const resposta = await fetch(destino);
  const copia = new Response(resposta.body, resposta);
  copia.headers.set('x-bm-rota', 'origem');
  copia.headers.set('x-bm-motivo', motivo);
  return copia;
}

/**
 * @returns {Promise<{estado:'ok', manifesto:object} | {estado:'ausente', manifesto:null} | {estado:'erro', motivo:string}>}
 */
async function lerManifestoDaCidade(env, ctx, host, uf, cidade) {
  const caminho = caminhoManifesto(uf, cidade);
  const blob = await lerBlob(env, ctx, host, caminho, TTL_MANIFESTO_S);
  if (blob.estado === 'ausente') return { estado: 'ausente', manifesto: null };
  if (blob.estado !== 'ok') return { estado: 'erro', motivo: 'manifesto-indisponivel' };

  const texto = await new Response(blob.corpo).text();
  const lido = lerManifestoMemorizado(caminho, texto, { uf, cidade });
  if (!lido.ok) {
    registrar('manifesto-invalido', { caminho, erros: lido.erros.slice(0, 5) });
    return { estado: 'erro', motivo: 'manifesto-invalido' };
  }
  return { estado: 'ok', manifesto: lido.manifesto };
}

/**
 * Lê um blob passando pelo cache da borda. Ausência (404) também é guardada, com o
 * mesmo TTL, para que cidade ainda não migrada não gere uma ida ao Blob por visita.
 *
 * @returns {Promise<{estado:'ok', corpo:ReadableStream} | {estado:'ausente'} | {estado:'erro'}>}
 */
async function lerBlob(env, ctx, host, caminho, ttl) {
  const cache = globalThis.caches?.default;
  const chave = new Request(chaveCacheBlob(host, caminho));

  if (cache) {
    const guardada = await cache.match(chave);
    if (guardada) {
      if (guardada.headers.has(MARCA_AUSENTE)) return { estado: 'ausente' };
      return { estado: 'ok', corpo: guardada.body };
    }
  }

  if (typeof env.BLOB_BASE !== 'string' || env.BLOB_BASE === '') {
    registrar('configuracao', { falta: 'BLOB_BASE' });
    return { estado: 'erro' };
  }

  let resposta;
  try {
    const sas = typeof env.BLOB_SAS === 'string' && env.BLOB_SAS !== '' ? `?${env.BLOB_SAS}` : '';
    resposta = await fetch(`${env.BLOB_BASE}/${caminho}${sas}`);
  } catch {
    registrar('blob-rede', { caminho });
    return { estado: 'erro' };
  }

  if (resposta.status === 404) {
    if (cache) {
      const marca = new Response(null, {
        headers: { 'Cache-Control': `max-age=${ttl}`, [MARCA_AUSENTE]: '1' },
      });
      // Ausência de HTML versionado não deve ficar presa por um ano.
      if (ttl === TTL_MANIFESTO_S) ctx?.waitUntil?.(cache.put(chave, marca));
    }
    return { estado: 'ausente' };
  }
  if (!resposta.ok) {
    registrar('blob-status', { caminho, status: resposta.status });
    return { estado: 'erro' };
  }

  if (cache) {
    const [paraCache, paraResposta] = resposta.body.tee();
    const guardar = new Response(paraCache, {
      headers: {
        'Cache-Control': `max-age=${ttl}`,
        'Content-Type': resposta.headers.get('Content-Type') ?? 'application/octet-stream',
      },
    });
    ctx?.waitUntil?.(cache.put(chave, guardar));
    return { estado: 'ok', corpo: paraResposta };
  }
  return { estado: 'ok', corpo: resposta.body };
}

/** Log estruturado. Nunca recebe a SAS nem URLs com query string. */
function registrar(evento, dados) {
  console.error(JSON.stringify({ origem: 'bm-edge', evento, ...dados }));
}

const PAGINA_404_MINIMA = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">'
  + '<meta name="robots" content="noindex"><title>Página não encontrada | BuscaMissa</title></head>'
  + '<body><p>Página não encontrada. <a href="/">Voltar para o BuscaMissa</a></p></body></html>';
