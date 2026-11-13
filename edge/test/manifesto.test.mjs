import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import {
  arquivoPaginaCidade, arquivoParoquia, caminhoBlobValido, caminhoManifesto, criarLeitorComMemoria,
  lerManifesto, loteValido, slugValido, validarManifesto, UFS,
} from '../src/manifesto.mjs';
import { manifestoBase, manifestoGrande } from './helpers.mjs';

const schema = JSON.parse(readFileSync(new URL('../schema/manifesto.schema.json', import.meta.url), 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validarSchema = ajv.compile(schema);

const semCampo = (campo) => {
  const m = manifestoBase();
  delete m[campo];
  return m;
};

/**
 * Casos que o JSON Schema e o validador devem julgar igual.
 * [nome, manifesto, válido?]
 */
const CASOS_FORMA = [
  ['manifesto base', manifestoBase(), true],
  ['manifesto grande', manifestoGrande(), true],
  ['lápide com redir', manifestoBase({ lapide: true, paroquias: {}, semPagina: [], redir: { a: '/paroquia/sp/osasco/a' } }), true],
  ['sem pagina e sem shell, listas vazias', (() => { const m = manifestoBase({ semPagina: [] }); delete m.shell; return m; })(), true],
  ['com pagina da cidade', manifestoBase({ pagina: '42-abc1234' }), true],
  ['esquema 2', manifestoBase({ esquema: 2 }), false],
  ['uf maiúscula', manifestoBase({ uf: 'SP' }), false],
  ['uf inexistente', manifestoBase({ uf: 'xx' }), false],
  ['cidade com acento', manifestoBase({ cidade: 'são-paulo' }), false],
  ['cidade com hífen duplo', manifestoBase({ cidade: 'sao--paulo' }), false],
  ['versao negativa', manifestoBase({ versao: -1 }), false],
  ['versao fracionária', manifestoBase({ versao: 1.5 }), false],
  ['versao string', manifestoBase({ versao: '42' }), false],
  ['execucao com espaço', manifestoBase({ execucao: 'gh 1' }), false],
  ['commit não hexadecimal', manifestoBase({ commit: 'xyz1234' }), false],
  ['commit curto', manifestoBase({ commit: 'abc12' }), false],
  ['geradoEm inválido', manifestoBase({ geradoEm: 'ontem' }), false],
  ['reversao string', manifestoBase({ reversao: 'false' }), false],
  ['campo extra', manifestoBase({ extra: 1 }), false],
  ['sem paroquias', semCampo('paroquias'), false],
  ['sem redir', semCampo('redir'), false],
  ['sem versao', semCampo('versao'), false],
  ['paroquias como lista', manifestoBase({ paroquias: [] }), false],
  ['slug maiúsculo em paroquias', manifestoBase({ paroquias: { Cristo: '42-abc1234' } }), false],
  ['lote ..', manifestoBase({ paroquias: { a: '..' } }), false],
  ['lote com barra (caminho em vez de lote)', manifestoBase({ paroquias: { a: 'html/sp/sao-paulo/42/a.html' } }), false],
  ['lote vazio', manifestoBase({ paroquias: { a: '' } }), false],
  ['lote com query', manifestoBase({ paroquias: { a: '42?x=1' } }), false],
  ['lote longo demais', manifestoBase({ paroquias: { a: 'x'.repeat(65) } }), false],
  ['pagina com barra', manifestoBase({ pagina: 'html/sp/sao-paulo/1/_cidade.html' }), false],
  ['semPagina com slug inválido', manifestoBase({ semPagina: ['A B'] }), false],
  ['redir externo', manifestoBase({ redir: { a: 'https://malicioso.example/x' } }), false],
  ['redir protocolo relativo', manifestoBase({ redir: { a: '//malicioso.example/paroquia/sp/a/b' } }), false],
  ['redir para /missas', manifestoBase({ redir: { a: '/missas/sp/sao-paulo' } }), false],
  ['redir com barra final', manifestoBase({ redir: { a: '/paroquia/sp/osasco/b/' } }), false],
  ['shell com ..', manifestoBase({ shell: '../shell.html' }), false],
];

for (const [nome, manifesto, valido] of CASOS_FORMA) {
  test(`forma: ${nome}`, () => {
    const r = validarManifesto(manifesto);
    assert.equal(r.ok, valido, `validador: ${JSON.stringify(r.erros)}`);
    assert.equal(validarSchema(manifesto), valido, `schema: ${JSON.stringify(validarSchema.errors)}`);
  });
}

/** Regras entre campos: o schema aceita, só o validador recusa. */
const CASOS_SEMANTICOS = [
  ['slug em paroquias e semPagina', manifestoBase({ semPagina: ['paroquia-cristo-rei'] }), /aparece em paroquias e em semPagina/],
  ['slug em paroquias e redir', manifestoBase({ redir: { 'paroquia-cristo-rei': '/paroquia/sp/osasco/x' } }), /aparece em paroquias e em redir/],
  ['slug repetido em semPagina', manifestoBase({ semPagina: ['a', 'a'] }), /aparece em semPagina e em semPagina/],
  ['redir para si mesmo', manifestoBase({ redir: { a: '/paroquia/sp/sao-paulo/a' } }), /aponta para si mesmo/],
  ['lápide com paróquias', manifestoBase({ lapide: true }), /lapide exige/],
  ['lápide com página de cidade', manifestoBase({ lapide: true, paroquias: {}, semPagina: [], pagina: '1-abc1234' }), /lapide exige/],
  ['semPagina sem shell', (() => { const m = manifestoBase(); delete m.shell; return m; })(), /semPagina exige shell/],
];

for (const [nome, manifesto, mensagem] of CASOS_SEMANTICOS) {
  test(`regra entre campos: ${nome}`, () => {
    assert.equal(validarSchema(manifesto), true, 'o schema sozinho aceita este caso');
    const r = validarManifesto(manifesto);
    assert.equal(r.ok, false);
    assert.ok(r.erros.some((e) => mensagem.test(e)), JSON.stringify(r.erros));
  });
}

test('cidade/uf precisam bater com o caminho de onde o manifesto foi lido', () => {
  assert.equal(validarManifesto(manifestoBase(), { uf: 'sp', cidade: 'sao-paulo' }).ok, true);
  assert.equal(validarManifesto(manifestoBase(), { uf: 'sp', cidade: 'osasco' }).ok, false);
  assert.equal(validarManifesto(manifestoBase(), { uf: 'rj', cidade: 'sao-paulo' }).ok, false);
});

test('__proto__ como slug não polui protótipo nem passa', () => {
  const texto = JSON.stringify(manifestoBase()).replace('"paroquias":{', '"paroquias":{"__proto__":"42-abc1234",');
  const r = lerManifesto(texto);
  assert.equal(r.ok, false);
  assert.equal({}.polluted, undefined);
});

test('lerManifesto: JSON inválido, vazio e grande demais não lançam', () => {
  assert.deepEqual(lerManifesto('{').ok, false);
  assert.deepEqual(lerManifesto(undefined).ok, false);
  assert.deepEqual(lerManifesto('x'.repeat(1024 * 1024 + 1)).ok, false);
  const ok = lerManifesto(JSON.stringify(manifestoBase()), { uf: 'sp', cidade: 'sao-paulo' });
  assert.equal(ok.ok, true);
  assert.equal(ok.manifesto.versao, 42);
});

test('manifesto do tamanho de São Paulo cabe com folga no teto', () => {
  const bytes = Buffer.byteLength(JSON.stringify(manifestoGrande()));
  assert.ok(bytes > 20_000 && bytes < 40_000, `${bytes} bytes`);
});

test('utilitários', () => {
  assert.equal(UFS.length, 27);
  assert.equal(slugValido('a'), true);
  assert.equal(slugValido('-a'), false);
  assert.equal(slugValido('a'.repeat(201)), false);
  assert.equal(caminhoBlobValido('html/sp/x/1-abc/a.html'), true);
  assert.equal(caminhoBlobValido('html//a.html'), false);
  assert.equal(caminhoBlobValido('html/./a.html'), false);
  assert.equal(caminhoManifesto('sp', 'sao-paulo'), 'ativo/sp/sao-paulo.json');
  assert.equal(arquivoParoquia('sp', 'sao-paulo', '42-abc1234', 'a'), 'html/sp/sao-paulo/42-abc1234/a.html');
  assert.equal(arquivoPaginaCidade('sp', 'sao-paulo', '42-abc1234'), 'html/sp/sao-paulo/42-abc1234/_cidade.html');
  assert.equal(loteValido('42-abc1234'), true);
  assert.equal(loteValido('.oculto'), false);
});

test('leitor com memória: texto idêntico reaproveita o objeto validado', () => {
  const ler = criarLeitorComMemoria();
  const texto = JSON.stringify(manifestoBase());
  const a = ler('ativo/sp/sao-paulo.json', texto, { uf: 'sp', cidade: 'sao-paulo' });
  const b = ler('ativo/sp/sao-paulo.json', `${texto}`, { uf: 'sp', cidade: 'sao-paulo' });
  assert.equal(a.memoria, false);
  assert.equal(b.memoria, true);
  assert.equal(a.manifesto, b.manifesto);
  assert.ok(Object.isFrozen(b.manifesto.paroquias));
  assert.throws(() => { 'use strict'; b.manifesto.paroquias.x = '1'; });
});

test('leitor com memória: texto novo é revalidado; inválido não é memorizado', () => {
  const ler = criarLeitorComMemoria();
  const chave = 'ativo/sp/sao-paulo.json';
  ler(chave, JSON.stringify(manifestoBase()));
  const nova = ler(chave, JSON.stringify(manifestoBase({ versao: 43 })));
  assert.equal(nova.memoria, false);
  assert.equal(nova.manifesto.versao, 43);
  const ruim = ler(chave, '{');
  assert.equal(ruim.ok, false);
  assert.equal(ler(chave, '{').ok, false);
});

test('leitor com memória: descarta a entrada menos usada ao passar do limite', () => {
  const ler = criarLeitorComMemoria(2);
  const t = (cidade) => JSON.stringify(manifestoBase({ cidade, paroquias: {}, semPagina: [], redir: {} }));
  ler('a', t('a'));
  ler('b', t('b'));
  ler('a', t('a')); // "a" passa a ser o mais recente
  ler('c', t('c')); // descarta "b"
  assert.equal(ler('a', t('a')).memoria, true);
  assert.equal(ler('b', t('b')).memoria, false);
});
