import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emMB, LIMITE_BYTES, rotaDaCidade, verificarHtmlCidade } from './verificar-html-cidade.mjs';

test('limite é 1,8 MB em bytes decimais', () => {
  assert.equal(LIMITE_BYTES, 1_800_000);
  assert.equal(emMB(LIMITE_BYTES), '1.80');
});

test('rotaDaCidade só reconhece missas/{uf}/{cidade}/index.html', () => {
  assert.equal(rotaDaCidade('missas/sp/sao-paulo/index.html'), '/missas/sp/sao-paulo');
  assert.equal(rotaDaCidade('missas\\rj\\rio-de-janeiro\\index.html'), '/missas/rj/rio-de-janeiro');
  assert.equal(rotaDaCidade('missas/sp/index.html'), null); // hub de UF
  assert.equal(rotaDaCidade('missas/sp/sao-paulo/extra/index.html'), null);
  assert.equal(rotaDaCidade('paroquia/sp/sao-paulo/x/index.html'), null);
  assert.equal(rotaDaCidade('missas/sp/sao-paulo/outro.html'), null);
});

test('exatamente no limite passa; 1 byte acima falha e é listado', () => {
  assert.equal(verificarHtmlCidade([{ rota: '/missas/sp/a', bytes: LIMITE_BYTES }]).ok, true);
  const r = verificarHtmlCidade([{ rota: '/missas/sp/a', bytes: LIMITE_BYTES + 1 }]);
  assert.equal(r.ok, false);
  assert.deepEqual(r.ofensoras, [{ rota: '/missas/sp/a', bytes: LIMITE_BYTES + 1 }]);
});

test('lista TODAS as ofensoras (não só a maior), em ordem decrescente', () => {
  const paginas = [
    { rota: '/missas/go/goiania', bytes: 1_180_000 },
    { rota: '/missas/rj/rio-de-janeiro', bytes: 2_710_000 },
    { rota: '/missas/sp/sao-paulo', bytes: 3_320_000 },
    { rota: '/missas/mg/belo-horizonte', bytes: 1_900_000 },
  ];
  const r = verificarHtmlCidade(paginas);
  assert.equal(r.ok, false);
  assert.deepEqual(r.ofensoras.map((p) => p.rota), ['/missas/sp/sao-paulo', '/missas/rj/rio-de-janeiro', '/missas/mg/belo-horizonte']);
  assert.equal(r.lidas, 4);
});

test('maiores traz até 5, mesmo passando', () => {
  const paginas = Array.from({ length: 8 }, (_, i) => ({ rota: `/missas/sp/c${i}`, bytes: 1000 * (i + 1) }));
  const r = verificarHtmlCidade(paginas);
  assert.equal(r.ok, true);
  assert.deepEqual(r.maiores.map((p) => p.bytes), [8000, 7000, 6000, 5000, 4000]);
});

test('lista vazia: lidas = 0 (o script falha nesse caso)', () => {
  assert.equal(verificarHtmlCidade([]).lidas, 0);
});
