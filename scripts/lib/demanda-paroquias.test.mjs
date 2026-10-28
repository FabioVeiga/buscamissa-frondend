import { test } from 'node:test';
import assert from 'node:assert/strict';
import { atualizarDemanda } from './demanda-paroquias.mjs';
import { CEPS_COM_CITACAO_EXTERNA } from './selecionar-paroquias-prerender.mjs';

const par = (cidade, slug, { confianca = 1, missas = 1, cep = '00000000' } = {}) => ({
  uf: 'sp',
  cidadeSlug: cidade,
  slug,
  igreja: { statusConfianca: confianca, missas: Array.from({ length: missas }, () => ({})), alteracao: '2026-01-01', endereco: { cep } },
});

// Uma cidade: piso = "piso" (confiança 3), "citada" é citação externa, o resto disputa vaga.
const LISTA = [
  par('c', 'piso', { confianca: 3 }),
  par('c', 'citada', { cep: CEPS_COM_CITACAO_EXTERNA[0] }),
  ...['a', 'b', 'd', 'e', 'f'].map((s) => par('c', s)),
  par('c', 'sem-horario', { missas: 0 }),
];
const TETO = 5; // 2 fixas + 3 vagas

/** Impressões por mês para cada slug: { slug: [set, out] }. */
const gsc = (mapa) =>
  Object.entries(mapa).flatMap(([slug, meses]) =>
    meses.map((impressoes, i) => ({ caminho: `/paroquia/sp/c/${slug}`, mes: ['2026-09', '2026-10'][i], impressoes, cliques: 0 })),
  );
const chaves = (r) => r.resto.map((x) => x.chave.split('/')[2]);
const anterior = (slugs, desde) => ({ resto: slugs.map((s) => ({ chave: `sp/c/${s}`, desde })) });

test('primeiro ciclo: vagas livres preenchidas por demanda; fixas e inelegíveis ficam de fora', () => {
  const r = atualizarDemanda({
    lista: LISTA,
    gsc: gsc({ a: [900, 900], b: [500, 500], d: [200, 200], piso: [9000, 9000], citada: [9000, 9000], 'sem-horario': [9000, 9000] }),
    hoje: '2026-10-27',
    teto: TETO,
  });
  assert.equal(r.relatorio.vagas, 3);
  assert.deepEqual(chaves(r), ['a', 'b', 'd']);
  assert.equal(r.relatorio.trocas, 0);
});

test('entrada exige ≥300 impressões e impressão nos 2 meses (pico isolado não entra)', () => {
  const r = atualizarDemanda({
    lista: LISTA,
    gsc: gsc({ a: [200, 50], b: [0, 5000], d: [150, 150] }),
    hoje: '2026-10-27',
    teto: TETO,
  });
  assert.deepEqual(chaves(r), ['d']);
});

test('troca exige margem de 1,5×: 1,49× não troca, 1,5× troca', () => {
  const base = { lista: LISTA, anterior: anterior(['a', 'b', 'd'], '2026-01-01'), hoje: '2026-10-27', teto: TETO };
  const sem = atualizarDemanda({ ...base, gsc: gsc({ a: [500, 500], b: [500, 500], d: [200, 200], e: [298, 298] }) });
  assert.deepEqual(chaves(sem).sort(), ['a', 'b', 'd']);
  const com = atualizarDemanda({ ...base, gsc: gsc({ a: [500, 500], b: [500, 500], d: [200, 200], e: [300, 300] }) });
  assert.deepEqual(chaves(com).sort(), ['a', 'b', 'e']);
  assert.deepEqual(com.relatorio.saidas, [{ chave: 'sp/c/d', motivo: 'troca' }]);
});

test('permanência mínima: quem entrou há menos de 60 dias não sai por troca', () => {
  const r = atualizarDemanda({
    lista: LISTA,
    gsc: gsc({ a: [500, 500], b: [500, 500], d: [0, 0], e: [5000, 5000] }),
    anterior: { resto: [{ chave: 'sp/c/a', desde: '2026-01-01' }, { chave: 'sp/c/b', desde: '2026-01-01' }, { chave: 'sp/c/d', desde: '2026-10-01' }] },
    hoje: '2026-10-27',
    teto: TETO,
  });
  assert.ok(chaves(r).includes('d'), 'd entrou há 26 dias e fica');
  assert.ok(chaves(r).includes('e'), 'e entra no lugar de a ou b');
  assert.equal(r.relatorio.trocas, 1);
});

test('teto de trocas por ciclo', () => {
  const r = atualizarDemanda({
    lista: LISTA,
    gsc: gsc({ a: [1, 1], b: [1, 1], d: [1, 1], e: [5000, 5000], f: [5000, 5000] }),
    anterior: anterior(['a', 'b', 'd'], '2026-01-01'),
    hoje: '2026-10-27',
    teto: TETO,
    criterios: { maxTrocas: 1 },
  });
  assert.equal(r.relatorio.trocas, 1);
  assert.equal(r.resto.length, 3);
});

test('incumbente que perdeu o horário sai sem contar como troca e a vaga é reposta', () => {
  const lista = LISTA.map((p) => (p.slug === 'a' ? par('c', 'a', { missas: 0 }) : p));
  const r = atualizarDemanda({
    lista,
    gsc: gsc({ b: [500, 500], d: [500, 500], e: [400, 400] }),
    anterior: anterior(['a', 'b', 'd'], '2026-10-20'),
    hoje: '2026-10-27',
    teto: TETO,
  });
  assert.deepEqual(chaves(r).sort(), ['b', 'd', 'e']);
  assert.deepEqual(r.relatorio.saidas, [{ chave: 'sp/c/a', motivo: 'inelegivel' }]);
  assert.equal(r.relatorio.trocas, 0);
});

test('mantém a data de entrada de quem fica e é determinístico', () => {
  const args = { lista: LISTA, gsc: gsc({ a: [500, 500], b: [400, 400], d: [300, 300] }), anterior: anterior(['a'], '2026-03-01'), hoje: '2026-10-27', teto: TETO };
  const r1 = atualizarDemanda(args);
  const r2 = atualizarDemanda({ ...args, lista: [...LISTA].reverse() });
  assert.deepEqual(r1.resto, r2.resto);
  assert.equal(r1.resto.find((x) => x.chave === 'sp/c/a').desde, '2026-03-01');
});

test('semente pela qualidade: quem já tem HTML só sai por troca com margem, não pela regra de entrada', async () => {
  const { anteriorPelaQualidade } = await import('./demanda-paroquias.mjs');
  const semente = anteriorPelaQualidade(LISTA, '2026-08-23', TETO);
  assert.equal(semente.resto.length, 3, '3 vagas, todas ocupadas pelo critério de qualidade');
  const dentro = semente.resto.map((r) => r.chave.split('/')[2]);
  const fora = ['a', 'b', 'd', 'e', 'f'].find((s) => !dentro.includes(s));
  // Uma das de dentro só tem impressão em 1 mês (não entraria); a de fora tem 1,2× ela.
  const so1mes = dentro[0];
  const r = atualizarDemanda({
    lista: LISTA,
    gsc: gsc({ [so1mes]: [0, 1000], [dentro[1]]: [500, 500], [dentro[2]]: [500, 500], [fora]: [600, 600] }),
    anterior: semente,
    hoje: '2026-10-27',
    teto: TETO,
  });
  assert.ok(chaves(r).includes(so1mes), 'fica: a candidata de fora não tem 1,5× a demanda dela');
  assert.equal(r.relatorio.trocas, 0);
});
