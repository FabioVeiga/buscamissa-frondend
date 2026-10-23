// Testes do guard de 404 na borda — `npm run test:scripts`.
//
// Determinísticos: sem internet, API ou banco. O único arquivo lido é o
// staticwebapp.config.json versionado, para travar o conjunto real de regras.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { LIMITE_CONFIG_BYTES, regras404, verificar404Borda } from './lib/verificar-404-borda.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_VERSIONADO = JSON.parse(
  readFileSync(join(__dirname, '..', 'src', 'staticwebapp.config.json'), 'utf-8'),
);

const MORTA = '/paroquia/sp/itupeva/paroquia-sao-sebastiao';
const OUTRA = '/paroquia/am/manaus/paroquia-sao-sebastiao';
const DETALHES = { route: '/detalhes/02839070', redirect: '/paroquia/sp/sao-paulo/paroquia-santos-apostolos', statusCode: 301 };

/** URLs mortas em produção que ainda existem na base de dev (medido em 2026-09-29). */
const SETE_DE_STAGING = [
  '/paroquia/mg/pocos-de-caldas/paroquia-basilica-nossa-senhora-da-saude',
  '/paroquia/sp/osasco/paroquia-sao-jose-vila-sao-jose',
  '/paroquia/pr/pinhais/paroquia-nossa-senhora-aparecida-pinhais',
  '/paroquia/sp/osasco/paroquia-sao-jose-operario-munhoz-junior',
  '/paroquia/to/formoso-do-araguaia/igreja-sao-jose',
  '/paroquia/sp/santo-andre/paroquia-pessoal-sao-miguel-colonia-alema',
  '/paroquia/sp/taubate/paroquia-nossa-senhora-do-rosario-santuario-de-santa-teresinha',
];

const regra = (route) => ({ route, statusCode: 404 });
const cfg = (...routes) => ({ routes: [DETALHES, ...routes] });

/** Build "limpo": nada existe; config pequeno. Cada teste sobrescreve o que precisa. */
function rodar({ config, ambiente = 'prod', bulk = [], sitemap = [], dist = [], bytes } = {}) {
  return verificar404Borda({
    config,
    ambiente,
    bulk: new Set(bulk),
    sitemap: new Set(sitemap),
    existeNoDist: (rota) => dist.includes(rota),
    bytesFinais: (c) => bytes ?? Buffer.byteLength(JSON.stringify(c, null, 2)),
  });
}

// ── Conjunto versionado ─────────────────────────────────────────────────────

test('o config versionado tem exatamente as 40 regras 404, todas válidas', () => {
  const regras = regras404(CONFIG_VERSIONADO);
  assert.equal(regras.length, 40);
  assert.equal(new Set(regras.map((r) => r.route)).size, 40);
  const r = rodar({ config: CONFIG_VERSIONADO, bytes: 7638 });
  assert.deepEqual(r.erros, []);
  assert.equal(r.semColisao.length, 40);
});

test('os 16 redirects de /detalhes não são tratados como regra 404', () => {
  const detalhes = CONFIG_VERSIONADO.routes.filter((r) => r.route.startsWith('/detalhes/'));
  assert.equal(detalhes.length, 16);
  assert.ok(detalhes.every((r) => !regras404(CONFIG_VERSIONADO).includes(r)));
});

// ── Colisão por ambiente ────────────────────────────────────────────────────

test('URL sem colisão passa nos dois ambientes', () => {
  for (const ambiente of ['staging', 'prod']) {
    const r = rodar({ config: cfg(regra(MORTA)), ambiente });
    assert.deepEqual(r.erros, [], ambiente);
    assert.deepEqual(r.semColisao, [MORTA], ambiente);
    assert.deepEqual(r.removidas, [], ambiente);
  }
});

test('colisão em staging: a regra sai do artefato, com aviso, sem erro', () => {
  const config = cfg(regra(MORTA), regra(OUTRA));
  const r = rodar({ config, ambiente: 'staging', bulk: [MORTA] });
  assert.deepEqual(r.erros, []);
  assert.deepEqual(r.removidas, [MORTA]);
  assert.equal(r.avisos.length, 1);
  assert.deepEqual(r.config.routes.map((x) => x.route), [DETALHES.route, OUTRA]);
  assert.equal(config.routes.length, 3, 'o config de entrada não é mutado');
});

test('colisão em produção: erro, nada é removido', () => {
  const r = rodar({ config: cfg(regra(MORTA)), ambiente: 'prod', bulk: [MORTA] });
  assert.equal(r.erros.length, 1);
  assert.match(r.erros[0], /existe no build \(bulk\)/);
  assert.deepEqual(r.removidas, []);
});

test('colisão no dist é identificada e falha em produção', () => {
  const r = rodar({ config: cfg(regra(MORTA)), dist: [MORTA] });
  assert.deepEqual(r.colisoes, [{ rota: MORTA, onde: ['dist'] }]);
  assert.equal(r.erros.length, 1);
});

test('colisão no sitemap é identificada e falha em produção', () => {
  const r = rodar({ config: cfg(regra(MORTA)), sitemap: [MORTA] });
  assert.deepEqual(r.colisoes, [{ rota: MORTA, onde: ['sitemap'] }]);
  assert.equal(r.erros.length, 1);
});

test('múltiplas colisões: todas identificadas, com todos os lugares', () => {
  const r = rodar({
    config: cfg(regra(MORTA), regra(OUTRA)),
    bulk: [MORTA, OUTRA], dist: [MORTA], sitemap: [MORTA],
  });
  assert.deepEqual(r.colisoes, [
    { rota: MORTA, onde: ['bulk', 'dist', 'sitemap'] },
    { rota: OUTRA, onde: ['bulk'] },
  ]);
  assert.equal(r.erros.length, 2);
});

test('caminho que só compartilha prefixo NÃO é colisão', () => {
  const vizinha = `${MORTA}-2`;
  const r = rodar({ config: cfg(regra(MORTA)), bulk: [vizinha], sitemap: [vizinha], dist: [vizinha] });
  assert.deepEqual(r.colisoes, []);
  assert.deepEqual(r.erros, []);
});

test('as 7 URLs conhecidas de staging: filtradas em staging, erro em produção', () => {
  const staging = rodar({ config: CONFIG_VERSIONADO, ambiente: 'staging', bulk: SETE_DE_STAGING });
  assert.deepEqual(staging.erros, []);
  assert.deepEqual([...staging.removidas].sort(), [...SETE_DE_STAGING].sort());
  assert.equal(regras404(staging.config).length, 33);
  assert.equal(regras404(CONFIG_VERSIONADO).length, 40, 'a lista versionada não muda');

  const prod = rodar({ config: CONFIG_VERSIONADO, ambiente: 'prod', bulk: SETE_DE_STAGING });
  assert.equal(prod.erros.length, 7);
  assert.deepEqual(prod.removidas, []);
});

test('ambiente ausente ou inválido falha — nunca cai no modo tolerante', () => {
  // Chamada direta: o `rodar()` tem `ambiente = 'prod'` como default, que mascararia
  // o caso `undefined` — justamente o que este teste defende.
  for (const ambiente of [undefined, '', 'dev', 'production', 'STAGING']) {
    const r = verificar404Borda({
      config: cfg(regra(MORTA)), ambiente,
      bulk: new Set([MORTA]), sitemap: new Set(), existeNoDist: () => false, bytesFinais: () => 0,
    });
    assert.equal(r.erros.length, 1, String(ambiente));
    assert.match(r.erros[0], /ambiente inválido/);
    assert.deepEqual(r.removidas, []);
  }
});

// ── Formato das regras (erro em qualquer ambiente) ─────────────────────────

const formatoInvalido = [
  ['URL duplicada', [regra(MORTA), regra(MORTA)], /duplicada/],
  ['URL em maiúsculas', [regra('/paroquia/SP/itupeva/paroquia-sao-sebastiao')], /maiúsculas/],
  ['URL com barra final', [regra(`${MORTA}/`)], /barra final/],
  ['regra 404 com rewrite', [{ route: MORTA, rewrite: '/404.html', statusCode: 404 }], /só "route" e "statusCode"/],
  ['regra 404 com propriedade extra', [{ route: MORTA, statusCode: 404, headers: { 'X-Robots-Tag': 'noindex' } }], /só "route" e "statusCode"/],
  ['statusCode diferente de 404', [{ route: MORTA, statusCode: 410 }], /statusCode deve ser 404/],
  ['rota fora do formato canônico', [regra('/paroquia/sp/itupeva')], /fora do formato/],
  ['404 fora de /paroquia/', [regra('/qualquer-coisa')], /fora do formato/],
];

for (const [nome, regras, erro] of formatoInvalido) {
  test(`formato inválido falha nos dois ambientes: ${nome}`, () => {
    for (const ambiente of ['staging', 'prod']) {
      const r = rodar({ config: cfg(...regras), ambiente });
      assert.ok(r.erros.some((e) => erro.test(e)), `${ambiente}: ${r.erros.join(' | ')}`);
    }
  });
}

test(`config acima de ${LIMITE_CONFIG_BYTES} B falha; no limite passa`, () => {
  assert.equal(rodar({ config: cfg(regra(MORTA)), bytes: LIMITE_CONFIG_BYTES }).erros.length, 0);
  const r = rodar({ config: cfg(regra(MORTA)), bytes: LIMITE_CONFIG_BYTES + 1 });
  assert.equal(r.erros.length, 1);
  assert.match(r.erros[0], /acima do teto/);
});
