/**
 * Worker rodando no runtime real (workerd, via Miniflare), com Blob e origem
 * simulados por `outboundService`. Nada sai da máquina.
 */
import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Miniflare } from 'miniflare';

import { manifestoBase } from './helpers.mjs';
import {
  CACHE_HTML, CACHE_NAO_ENCONTRADA, CACHE_REDIRECIONAMENTO, TTL_HTML_S, TTL_MANIFESTO_S,
} from '../src/borda.mjs';

/** Valores medidos no SWA de produção em 13/11/2026. */
const CACHE_SWA = 'public, must-revalidate, max-age=30';
const SEGURANCA_SWA = {
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'SAMEORIGIN',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'geolocation=(self), camera=(), microphone=(), payment=()',
  'content-security-policy-report-only': "default-src 'self'",
};
const PAGINA_404_ORIGEM = '<html>pagina 404 da origem</html>';

const BLOB = 'https://blob.test/publicacao';
const SAS = 'sv=2025&sig=SEGREDO';
const ORIGEM = 'https://origem.test';
const HOST = 'https://bm.test';

/** Estado do "mundo externo" que cada teste ajusta. */
const mundo = {
  blobs: new Map(),
  blobFalha: false,
  chamadasBlob: [],
  chamadasOrigem: [],
  /** Como a origem responde a /404.html: 'ok' | 'ausente' | 'erro' | 'rede'. */
  pagina404: 'ok',
};

function reiniciarMundo() {
  mundo.blobs = new Map([
    ['ativo/sp/sao-paulo.json', JSON.stringify(manifestoBase())],
    ['html/sp/sao-paulo/42-abc1234/paroquia-cristo-rei.html', '<html>cristo rei v42</html>'],
    ['shell/abc1234/index.html', '<html>shell</html>'],
  ]);
  mundo.blobFalha = false;
  mundo.chamadasBlob = [];
  mundo.chamadasOrigem = [];
  mundo.pagina404 = 'ok';
}

async function exterior(request) {
  const url = new URL(request.url);
  if (url.origin === new URL(BLOB).origin) {
    mundo.chamadasBlob.push(url.toString());
    if (mundo.blobFalha) return new Response('erro', { status: 503 });
    const caminho = url.pathname.replace('/publicacao/', '');
    if (url.search !== `?${SAS}`) return new Response('sem permissão', { status: 403 });
    const corpo = mundo.blobs.get(caminho);
    return corpo === undefined ? new Response('', { status: 404 }) : new Response(corpo, { status: 200 });
  }
  if (url.origin === ORIGEM) {
    mundo.chamadasOrigem.push(url.pathname + url.search);
    if (url.pathname === '/404.html') {
      if (mundo.pagina404 === 'rede') throw new Error('origem fora do ar');
      if (mundo.pagina404 === 'erro') return new Response('erro', { status: 503 });
      if (mundo.pagina404 === 'ausente') return new Response('', { status: 404 });
      return new Response(PAGINA_404_ORIGEM, {
        status: 200,
        headers: { 'content-type': 'text/html', 'cache-control': CACHE_SWA, 'set-cookie': 'x=1', ...SEGURANCA_SWA },
      });
    }
    return new Response(`origem:${url.pathname}`, { status: 200, headers: { 'x-origem': '1' } });
  }
  return new Response('host inesperado', { status: 599 });
}

let mf;
let rodada = 0;

/** Cada teste usa um host próprio: o cache da borda não vaza entre testes. */
function hostDoTeste() {
  rodada++;
  return HOST.replace('bm.test', `t${rodada}.bm.test`);
}

async function pedir(caminho, init = {}) {
  return mf.dispatchFetch(`${init.host ?? HOST}${caminho}`, { redirect: 'manual', ...init });
}

before(async () => {
  mf = new Miniflare({
    modules: true,
    scriptPath: fileURLToPath(new URL('../src/worker.mjs', import.meta.url)),
    modulesRules: [{ type: 'ESModule', include: ['**/*.mjs'] }],
    compatibilityDate: '2025-06-01',
    bindings: { BLOB_BASE: BLOB, BLOB_SAS: SAS, ORIGEM, ROTAS: 'paroquia,cidade' },
    outboundService: exterior,
  });
  await mf.ready;
});

after(async () => {
  await mf?.dispose();
});

beforeEach(reiniciarMundo);

describe('respostas', () => {
  test('paróquia publicada: 200 com HTML do Blob e cabeçalhos de rastreio', async () => {
    const host = hostDoTeste();
    const r = await pedir('/paroquia/sp/sao-paulo/paroquia-cristo-rei', { host });
    assert.equal(r.status, 200);
    assert.equal(await r.text(), '<html>cristo rei v42</html>');
    assert.equal(r.headers.get('content-type'), 'text/html; charset=utf-8');
    assert.equal(r.headers.get('x-bm-rota'), 'html');
    assert.equal(r.headers.get('x-bm-execucao'), 'gh-123-1');
    assert.equal(r.headers.get('x-bm-versao'), '42');
    assert.equal(r.headers.get('cache-control'), CACHE_SWA);
    assert.equal(r.headers.get('x-robots-tag'), null);
    assert.equal(mundo.chamadasOrigem.length, 0);
  });

  test('HEAD não traz corpo', async () => {
    const r = await pedir('/paroquia/sp/sao-paulo/paroquia-cristo-rei', { host: hostDoTeste(), method: 'HEAD' });
    assert.equal(r.status, 200);
    assert.equal(await r.text(), '');
  });

  test('igreja sem página: shell com noindex', async () => {
    const r = await pedir('/paroquia/sp/sao-paulo/capela-sem-pagina', { host: hostDoTeste() });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('cache-control'), CACHE_SWA);
    assert.equal(await r.text(), '<html>shell</html>');
    assert.equal(r.headers.get('x-robots-tag'), 'noindex');
    assert.equal(r.headers.get('x-bm-rota'), 'shell');
  });

  test('redirecionamento: 301 preservando a query string', async () => {
    const host = hostDoTeste();
    const r = await pedir('/paroquia/sp/sao-paulo/mudou-de-cidade?utm_source=x', { host });
    assert.equal(r.status, 301);
    assert.equal(r.headers.get('location'), `${host}/paroquia/sp/osasco/mudou-de-cidade?utm_source=x`);
    assert.equal(r.headers.get('x-bm-rota'), 'redirecionar');
    assert.equal(r.headers.get('cache-control'), 'public, max-age=3600');
  });

  test('não encontrada: 404 com o /404.html da origem, nunca o shell', async () => {
    const r = await pedir('/paroquia/sp/sao-paulo/nao-existe', { host: hostDoTeste() });
    assert.equal(r.status, 404);
    assert.equal(await r.text(), PAGINA_404_ORIGEM);
    assert.equal(r.headers.get('x-robots-tag'), 'noindex');
    assert.equal(r.headers.get('cache-control'), CACHE_SWA);
    assert.equal(r.headers.get('x-bm-404'), 'origem');
    assert.ok(!mundo.chamadasBlob.some((u) => u.includes('/shell/')), 'o shell não pode ser lido para o 404');
  });

  test('URL malformada: 404 com a página da origem, sem consultar o Blob nem repassar a URL', async () => {
    for (const caminho of ['/paroquia/sp/sao-paulo', '/paroquia/xx/a/b', '/paroquia/sp/sao-paulo/a%2Fb', '/paroquia/sp/sao-paulo/a/b']) {
      const r = await pedir(caminho, { host: hostDoTeste() });
      assert.equal(r.status, 404, caminho);
      assert.equal(await r.text(), PAGINA_404_ORIGEM);
      assert.equal(r.headers.get('x-robots-tag'), 'noindex');
    }
    assert.equal(mundo.chamadasBlob.length, 0);
    assert.ok(mundo.chamadasOrigem.every((c) => c === '/404.html'), JSON.stringify(mundo.chamadasOrigem));
  });

  test('URL não canônica: 301 para a forma canônica', async () => {
    const host = hostDoTeste();
    const r = await pedir('/paroquia/SP/Sao-Paulo/Paroquia-Cristo-Rei/', { host });
    assert.equal(r.status, 301);
    assert.equal(r.headers.get('cache-control'), 'public, max-age=3600');
    assert.equal(r.headers.get('location'), `${host}/paroquia/sp/sao-paulo/paroquia-cristo-rei`);
  });

  test('página de cidade com manifesto sem `pagina` fica com a origem', async () => {
    const r = await pedir('/missas/sp/sao-paulo', { host: hostDoTeste() });
    assert.equal(r.headers.get('x-bm-rota'), 'origem');
    assert.equal(r.headers.get('x-bm-motivo'), 'cidade-sem-pagina-publicada');
  });

  test('lápide: 404 para a paróquia, 301 mantido', async () => {
    mundo.blobs.set('ativo/sp/sao-paulo.json', JSON.stringify(manifestoBase({
      lapide: true, paroquias: {}, semPagina: [], redir: { a: '/paroquia/sp/osasco/a' },
    })));
    const host = hostDoTeste();
    assert.equal((await pedir('/paroquia/sp/sao-paulo/paroquia-cristo-rei', { host })).status, 404);
    assert.equal((await pedir('/paroquia/sp/sao-paulo/a', { host })).status, 301);
  });
});

describe('fallback para a origem (na dúvida, origem)', () => {
  const casos = [
    ['rota fora do Worker', () => {}, '/cidades', 'rota-fora'],
    ['cidade sem manifesto', () => {}, '/paroquia/rj/niteroi/qualquer', 'sem-manifesto'],
    ['Blob fora do ar', () => { mundo.blobFalha = true; }, '/paroquia/sp/sao-paulo/paroquia-cristo-rei', 'manifesto-indisponivel'],
    ['manifesto não é JSON', () => { mundo.blobs.set('ativo/sp/sao-paulo.json', '{'); }, '/paroquia/sp/sao-paulo/paroquia-cristo-rei', 'manifesto-invalido'],
    ['manifesto de outra cidade', () => {
      mundo.blobs.set('ativo/sp/sao-paulo.json', JSON.stringify(manifestoBase({ cidade: 'osasco', paroquias: {}, semPagina: [] })));
    }, '/paroquia/sp/sao-paulo/paroquia-cristo-rei', 'manifesto-invalido'],
    ['HTML referenciado ausente', () => {
      mundo.blobs.delete('html/sp/sao-paulo/42-abc1234/paroquia-cristo-rei.html');
    }, '/paroquia/sp/sao-paulo/paroquia-cristo-rei', 'arquivo-indisponivel'],
  ];

  for (const [nome, preparar, caminho, motivo] of casos) {
    test(nome, async () => {
      preparar();
      const r = await pedir(`${caminho}?q=1`, { host: hostDoTeste() });
      assert.equal(r.status, 200);
      assert.equal(await r.text(), `origem:${caminho}`);
      assert.equal(r.headers.get('x-bm-rota'), 'origem');
      assert.equal(r.headers.get('x-bm-motivo'), motivo);
      assert.equal(r.headers.get('x-origem'), '1');
      assert.deepEqual(mundo.chamadasOrigem, [`${caminho}?q=1`]);
    });
  }

  test('POST vai direto para a origem', async () => {
    const r = await pedir('/paroquia/sp/sao-paulo/paroquia-cristo-rei', { host: hostDoTeste(), method: 'POST', body: 'x' });
    assert.equal(r.headers.get('x-bm-motivo'), 'metodo');
    assert.equal(mundo.chamadasBlob.length, 0);
  });

  test('a SAS não aparece em nenhum cabeçalho de resposta', async () => {
    mundo.blobFalha = true;
    const r = await pedir('/paroquia/sp/sao-paulo/paroquia-cristo-rei', { host: hostDoTeste() });
    for (const [, valor] of r.headers) assert.ok(!valor.includes('SEGREDO'));
    assert.ok(!(await r.text()).includes('SEGREDO'));
  });
});

describe('cache da borda', () => {
  test('manifesto e HTML são lidos do Blob uma vez e depois vêm do cache', async () => {
    const host = hostDoTeste();
    for (let i = 0; i < 3; i++) {
      const r = await pedir('/paroquia/sp/sao-paulo/paroquia-cristo-rei', { host });
      assert.equal(await r.text(), '<html>cristo rei v42</html>');
    }
    assert.deepEqual(mundo.chamadasBlob.map((u) => new URL(u).pathname), [
      '/publicacao/ativo/sp/sao-paulo.json',
      '/publicacao/html/sp/sao-paulo/42-abc1234/paroquia-cristo-rei.html',
    ]);
  });

  test('ausência de manifesto também fica em cache (cidade não migrada não martela o Blob)', async () => {
    const host = hostDoTeste();
    await pedir('/paroquia/rj/niteroi/a', { host });
    await pedir('/paroquia/rj/niteroi/b', { host });
    assert.equal(mundo.chamadasBlob.length, 1);
    assert.equal(mundo.chamadasOrigem.length, 2);
  });

  test('erro do Blob não é guardado: a próxima requisição tenta de novo', async () => {
    const host = hostDoTeste();
    mundo.blobFalha = true;
    await pedir('/paroquia/sp/sao-paulo/paroquia-cristo-rei', { host });
    mundo.blobFalha = false;
    const r = await pedir('/paroquia/sp/sao-paulo/paroquia-cristo-rei', { host });
    assert.equal(r.headers.get('x-bm-rota'), 'html');
  });

  test('manifesto novo só aparece depois do TTL ou da purga (versão anterior continua válida)', async () => {
    const host = hostDoTeste();
    await pedir('/paroquia/sp/sao-paulo/paroquia-cristo-rei', { host });
    mundo.blobs.set('ativo/sp/sao-paulo.json', JSON.stringify(manifestoBase({ versao: 43 })));
    const r = await pedir('/paroquia/sp/sao-paulo/paroquia-cristo-rei', { host });
    assert.equal(r.headers.get('x-bm-versao'), '42');

    // Purga por URL = remover a chave do cache (é o que a Cloudflare faz).
    const caches = await mf.getCaches();
    const removida = await caches.default.delete(`${host}/__bm/blob/ativo/sp/sao-paulo.json`);
    assert.equal(removida, true);
    const depois = await pedir('/paroquia/sp/sao-paulo/paroquia-cristo-rei', { host });
    assert.equal(depois.headers.get('x-bm-versao'), '43');
  });
});

describe('404: página da origem', () => {
  test('página disponível: status 404, cabeçalhos de segurança da origem, noindex e Cache-Control do SWA', async () => {
    const r = await pedir('/paroquia/sp/sao-paulo/nao-existe', { host: hostDoTeste() });
    assert.equal(r.status, 404);
    assert.equal(await r.text(), PAGINA_404_ORIGEM);
    for (const [nome, valor] of Object.entries(SEGURANCA_SWA)) assert.equal(r.headers.get(nome), valor, nome);
    assert.equal(r.headers.get('content-type'), 'text/html');
    assert.equal(r.headers.get('cache-control'), CACHE_SWA);
    assert.equal(r.headers.get('x-robots-tag'), 'noindex');
    assert.equal(r.headers.get('x-bm-rota'), 'nao-encontrada');
    assert.equal(r.headers.get('x-bm-versao'), '42');
    assert.equal(r.headers.get('set-cookie'), null, 'cabeçalho fora da lista não é copiado');
  });

  const falhas = [
    ['origem retorna erro (503)', 'erro'],
    ['origem sem o arquivo (404)', 'ausente'],
    ['origem indisponível (rede)', 'rede'],
  ];
  for (const [nome, modo] of falhas) {
    test(`${nome}: página embutida, ainda 404 e noindex`, async () => {
      mundo.pagina404 = modo;
      const r = await pedir('/paroquia/sp/sao-paulo/nao-existe', { host: hostDoTeste() });
      assert.equal(r.status, 404);
      assert.match(await r.text(), /Página não encontrada/);
      assert.equal(r.headers.get('x-robots-tag'), 'noindex');
      assert.equal(r.headers.get('cache-control'), CACHE_SWA);
      assert.equal(r.headers.get('content-type'), 'text/html; charset=utf-8');
      assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(r.headers.get('x-bm-404'), 'embutida');
    });
  }

  test('URL malformada com a origem fora: continua 404, nunca 200', async () => {
    mundo.pagina404 = 'rede';
    const r = await pedir('/paroquia/xx/a/b', { host: hostDoTeste() });
    assert.equal(r.status, 404);
    assert.equal(r.headers.get('x-robots-tag'), 'noindex');
  });

  test('HEAD: 404 sem corpo e com os mesmos cabeçalhos', async () => {
    const r = await pedir('/paroquia/sp/sao-paulo/nao-existe', { host: hostDoTeste(), method: 'HEAD' });
    assert.equal(r.status, 404);
    assert.equal(await r.text(), '');
    assert.equal(r.headers.get('x-robots-tag'), 'noindex');
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  });

  test('a página de 404 é buscada uma vez e reaproveitada do cache da borda', async () => {
    const host = hostDoTeste();
    for (const slug of ['a', 'b', 'c']) {
      const r = await pedir(`/paroquia/sp/sao-paulo/${slug}`, { host });
      assert.equal(await r.text(), PAGINA_404_ORIGEM);
      assert.equal(r.headers.get('x-frame-options'), 'SAMEORIGIN', 'cabeçalhos sobrevivem ao cache');
    }
    assert.deepEqual(mundo.chamadasOrigem, ['/404.html']);
  });

  test('falha da origem não é guardada: a próxima requisição busca de novo', async () => {
    const host = hostDoTeste();
    mundo.pagina404 = 'erro';
    assert.equal((await pedir('/paroquia/sp/sao-paulo/a', { host })).headers.get('x-bm-404'), 'embutida');
    mundo.pagina404 = 'ok';
    assert.equal((await pedir('/paroquia/sp/sao-paulo/b', { host })).headers.get('x-bm-404'), 'origem');
  });
});

describe('constantes de cache', () => {
  test('HTML e 404 iguais ao SWA; 301 por 1 h; TTLs internos de Blob e manifesto inalterados', () => {
    assert.equal(CACHE_HTML, CACHE_SWA);
    assert.equal(CACHE_NAO_ENCONTRADA, CACHE_SWA);
    assert.equal(CACHE_REDIRECIONAMENTO, 'public, max-age=3600');
    assert.equal(TTL_MANIFESTO_S, 30);
    assert.equal(TTL_HTML_S, 365 * 24 * 3600);
  });
});
