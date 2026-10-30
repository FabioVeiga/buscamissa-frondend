import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ARQUIVO_DEMANDA,
  CEPS_COM_CITACAO_EXTERNA,
  lerDemanda,
  porQualidade,
  selecionarParoquias,
  VARIAVEL_CRITERIO,
} from './selecionar-paroquias-prerender.mjs';

/** Paróquia do cache do prebuild (só os campos que a seleção lê). */
const par = (uf, cidade, slug, { confianca = 1, missas = 1, cep = '00000000', alteracao = '2026-01-01' } = {}) => ({
  uf,
  cidadeSlug: cidade,
  slug,
  igreja: {
    statusConfianca: confianca,
    missas: Array.from({ length: missas }, (_, i) => ({ diaSemana: i % 7 })),
    alteracao,
    endereco: { cep },
  },
});
const chave = (s) => `${s.uf}/${s.cidade}/${s.slug}`;

// 3 cidades; a melhor de cada é a de confiança 3. Uma paróquia citada externamente.
const LISTA = [
  par('sp', 'campinas', 'piso-campinas', { confianca: 3 }),
  par('sp', 'campinas', 'campinas-b'),
  par('sp', 'campinas', 'campinas-c', { confianca: 2 }),
  par('sp', 'sao-paulo', 'piso-sp', { confianca: 3 }),
  par('sp', 'sao-paulo', 'sp-citada', { cep: CEPS_COM_CITACAO_EXTERNA[0] }),
  par('sp', 'sao-paulo', 'sp-b'),
  par('sp', 'sao-paulo', 'sp-c', { confianca: 2 }),
  par('pa', 'cumaru-do-norte', 'piso-cumaru', { confianca: 3 }),
  par('pa', 'cumaru-do-norte', 'sem-horario', { confianca: 3, missas: 0 }),
];

/** Critério anterior, reescrito aqui de forma independente (piso → citação → qualidade). */
function criterioAnterior(lista, teto) {
  const eleg = lista.filter((p) => (p.igreja?.missas?.length ?? 0) > 0);
  const melhor = new Map();
  for (const p of eleg) {
    const k = `${p.uf}/${p.cidadeSlug}`;
    if (!melhor.has(k) || porQualidade(p, melhor.get(k)) < 0) melhor.set(k, p);
  }
  const piso = [...melhor.keys()].sort().map((k) => melhor.get(k));
  const cit = eleg.filter((p) => !piso.includes(p) && CEPS_COM_CITACAO_EXTERNA.includes(p.igreja.endereco.cep));
  const resto = eleg.filter((p) => !piso.includes(p) && !cit.includes(p)).sort(porQualidade);
  return [...piso, ...cit, ...resto].slice(0, teto).map((p) => `${p.uf}/${p.cidadeSlug}/${p.slug}`);
}

test('sem demanda: resultado idêntico ao critério anterior (piso → citação → qualidade)', () => {
  const r = selecionarParoquias(LISTA, { demanda: null, teto: 6 }).map(chave);
  assert.deepEqual(r, criterioAnterior(LISTA, 6));
});

test('com demanda: o resto segue a ordem da demanda, depois completa por qualidade', () => {
  const r = selecionarParoquias(LISTA, { demanda: ['sp/campinas/campinas-b', 'sp/sao-paulo/sp-b'], teto: 7 }).map(chave);
  assert.deepEqual(r.slice(4), ['sp/campinas/campinas-b', 'sp/sao-paulo/sp-b', 'sp/campinas/campinas-c']);
});

test('piso de cada cidade e citação externa nunca saem, mesmo fora da demanda', () => {
  const r = new Set(selecionarParoquias(LISTA, { demanda: ['sp/sao-paulo/sp-b', 'sp/campinas/campinas-b'], teto: 5 }).map(chave));
  for (const k of ['sp/campinas/piso-campinas', 'sp/sao-paulo/piso-sp', 'pa/cumaru-do-norte/piso-cumaru', 'sp/sao-paulo/sp-citada']) {
    assert.ok(r.has(k), `${k} deveria estar na seleção`);
  }
  assert.equal(r.size, 5);
});

test('demanda com chave inexistente, sem horário ou já fixa é ignorada', () => {
  const r = selecionarParoquias(LISTA, {
    demanda: ['xx/nao/existe', 'pa/cumaru-do-norte/sem-horario', 'sp/sao-paulo/piso-sp', 'sp/sao-paulo/sp-c'],
    teto: 5,
  }).map(chave);
  assert.deepEqual(r.slice(4), ['sp/sao-paulo/sp-c']);
  assert.ok(!r.includes('pa/cumaru-do-norte/sem-horario'));
  assert.equal(new Set(r).size, r.length, 'sem duplicata');
});

test('determinística: mesma entrada em outra ordem → mesma seleção', () => {
  const demanda = ['sp/campinas/campinas-c', 'sp/sao-paulo/sp-b'];
  const a = selecionarParoquias(LISTA, { demanda, teto: 7 });
  const b = selecionarParoquias([...LISTA].reverse(), { demanda, teto: 7 });
  assert.deepEqual(new Set(a.map(chave)), new Set(b.map(chave)));
});

test('teto é respeitado', () => {
  assert.equal(selecionarParoquias(LISTA, { demanda: null, teto: 3 }).length, 3);
});

// --- lerDemanda: fallback e reversão de verdade, com arquivo em disco ---

function baseCom(conteudo) {
  const base = mkdtempSync(join(tmpdir(), 'demanda-'));
  if (conteudo !== undefined) {
    mkdirSync(join(base, 'scripts', 'data'), { recursive: true });
    writeFileSync(join(base, ARQUIVO_DEMANDA), conteudo);
  }
  return base;
}

test('lerDemanda: arquivo válido → lista de chaves na ordem do arquivo', () => {
  const base = baseCom(JSON.stringify({ resto: [{ chave: 'sp/a/x' }, { chave: 'sp/a/y' }] }));
  assert.deepEqual(lerDemanda(base, {}), ['sp/a/x', 'sp/a/y']);
});

test('lerDemanda: sem arquivo → null (critério de qualidade)', () => {
  assert.equal(lerDemanda(baseCom(), {}), null);
});

test('lerDemanda: arquivo inválido ou sem "resto" → null, sem lançar', () => {
  assert.equal(lerDemanda(baseCom('{não é json'), {}), null);
  assert.equal(lerDemanda(baseCom(JSON.stringify({ outra: 1 })), {}), null);
});

test(`lerDemanda: ${VARIAVEL_CRITERIO}=qualidade ignora um arquivo válido (reversão)`, () => {
  const base = baseCom(JSON.stringify({ resto: [{ chave: 'sp/a/x' }] }));
  assert.equal(lerDemanda(base, { [VARIAVEL_CRITERIO]: 'qualidade' }), null);
});
