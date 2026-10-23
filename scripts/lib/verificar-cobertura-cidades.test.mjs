import { test } from 'node:test';
import assert from 'node:assert/strict';
import { motivoSnapshotsDesalinhados, verificarCoberturaCidades } from './verificar-cobertura-cidades.mjs';

/** paroquias.json: um item por paróquia (só os campos que o guard lê). */
const bulkParoquias = (uf, cidadeSlug, ids) =>
  ids.map((id) => ({ uf, cidadeSlug, slug: `p-${id}`, igreja: { id } }));

/** cidades.json: uma cidade com suas igrejas. */
const cidade = (uf, cidadeSlug, ids, extra = {}) => ({
  uf,
  cidadeSlug,
  igrejas: ids.map((id) => ({ id, slug: `p-${id}`, nome: `P${id}` })),
  ...extra,
});

const faixa = (de, ate) => Array.from({ length: ate - de + 1 }, (_, i) => de + i);

test('cenário normal: todas as paróquias presentes por id → ok', () => {
  const r = verificarCoberturaCidades(
    [cidade('rj', 'rio-de-janeiro', faixa(1, 485)), cidade('sp', 'sao-paulo', faixa(1001, 1342))],
    [...bulkParoquias('rj', 'rio-de-janeiro', faixa(1, 485)), ...bulkParoquias('sp', 'sao-paulo', faixa(1001, 1342))],
  );
  assert.equal(r.status, 'ok');
  assert.deepEqual(r.problemas, []);
  assert.equal(r.resumo.paroquias, 827);
});

test('cidade acima do teto (lista cortada em 300 de 485) → divergente, com os ids que faltam', () => {
  const r = verificarCoberturaCidades(
    [cidade('rj', 'rio-de-janeiro', faixa(1, 300))],
    bulkParoquias('rj', 'rio-de-janeiro', faixa(1, 485)),
  );
  assert.equal(r.status, 'divergente');
  assert.equal(r.problemas.length, 1);
  const [p] = r.problemas;
  assert.equal(p.tipo, 'faltando');
  assert.equal(p.cidade, 'rj/rio-de-janeiro');
  assert.equal(p.esperado, 485);
  assert.equal(p.listado, 300);
  assert.deepEqual(p.ids, faixa(301, 485));
});

test('mesma quantidade, ids diferentes → divergente (faltando E fora-do-bulk)', () => {
  const r = verificarCoberturaCidades(
    [cidade('sp', 'sao-paulo', [1, 2, 3, 99])],
    bulkParoquias('sp', 'sao-paulo', [1, 2, 3, 4]),
  );
  assert.equal(r.status, 'divergente');
  assert.deepEqual(
    r.problemas.map((p) => [p.tipo, p.ids]),
    [['faltando', [4]], ['fora-do-bulk', [99]]],
  );
});

test('igreja SEM slug a mais na cidade é permitida (fora do bulk por filtro), mas contada', () => {
  const c = cidade('pb', 'joao-pessoa', [1, 2]);
  c.igrejas.push({ id: 3, slug: null, nome: 'Sem slug' });
  const r = verificarCoberturaCidades([c], bulkParoquias('pb', 'joao-pessoa', [1, 2]));
  assert.equal(r.status, 'ok');
  assert.equal(r.resumo.semSlug, 1);
});

test('id duplicado na lista da cidade → divergente', () => {
  const r = verificarCoberturaCidades([cidade('df', 'brasilia', [1, 2, 2])], bulkParoquias('df', 'brasilia', [1, 2]));
  assert.equal(r.status, 'divergente');
  assert.deepEqual(r.problemas.map((p) => [p.tipo, p.ids]), [['duplicado', [2]]]);
});

test('cidade inteira ausente das páginas → divergente', () => {
  const r = verificarCoberturaCidades(
    [cidade('rj', 'rio-de-janeiro', [1])],
    [...bulkParoquias('rj', 'rio-de-janeiro', [1]), ...bulkParoquias('sp', 'santos', [7, 8])],
  );
  assert.equal(r.status, 'divergente');
  assert.deepEqual(r.problemas.map((p) => [p.tipo, p.cidade, p.ids]), [['cidade-ausente', 'sp/santos', [7, 8]]]);
});

test('chave de cidade ignora caixa (o backend agrupa com UF maiúscula)', () => {
  const r = verificarCoberturaCidades([cidade('RJ', 'Rio-De-Janeiro', [1])], bulkParoquias('rj', 'rio-de-janeiro', [1]));
  assert.equal(r.status, 'ok');
});

test('dado que não permite verificar NUNCA passa como ok', () => {
  const casos = [
    [undefined, bulkParoquias('rj', 'x', [1])],
    [[], bulkParoquias('rj', 'x', [1])],
    [[cidade('rj', 'x', [1])], []],
    [[cidade('rj', 'x', [1])], { erro: 'objeto' }],
    [[cidade('rj', 'x', [1])], [{ uf: 'rj', cidadeSlug: 'x', igreja: {} }]],
    [[{ uf: 'rj', cidadeSlug: 'x' }], bulkParoquias('rj', 'x', [1])],
    [[{ uf: 'rj', cidadeSlug: 'x', igrejas: [{ nome: 'sem id' }] }], bulkParoquias('rj', 'x', [1])],
  ];
  for (const [c, p] of casos) {
    const r = verificarCoberturaCidades(c, p);
    assert.equal(r.status, 'inverificavel', JSON.stringify({ c, p }).slice(0, 120));
    assert.ok(r.motivo);
  }
});

test('bulks de downloads diferentes → inverificável; mesma execução → ok', () => {
  const t = Date.UTC(2026, 9, 14, 18, 0);
  assert.equal(motivoSnapshotsDesalinhados(t, t + 40_000), null);
  assert.match(motivoSnapshotsDesalinhados(t, t + 3 * 3600_000), /não são do mesmo download/);
  assert.match(motivoSnapshotsDesalinhados(Number.NaN, t), /indisponível/);
});
