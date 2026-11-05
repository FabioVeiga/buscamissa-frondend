// A7: o script inline `#bm-dia` de src/index.html marca <html data-dia="N"> só para um
// ?dia= válido na página de cidade, e nunca quebra a página.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');
const codigo = html.match(/<script id="bm-dia">([\s\S]*?)<\/script>/)?.[1];

function rodar(url, { semURLSearchParams = false } = {}) {
  const { pathname, search } = new URL(url, 'https://buscamissa.com.br');
  const atributos = {};
  const contexto = {
    location: { pathname, search },
    document: { documentElement: { setAttribute: (k, v) => { atributos[k] = v; } } },
  };
  if (!semURLSearchParams) contexto.URLSearchParams = URLSearchParams;
  vm.runInNewContext(codigo, contexto);
  return atributos['data-dia'];
}

test('o script existe no <head>, antes do <body>', () => {
  assert.ok(codigo, 'script #bm-dia não encontrado');
  assert.ok(html.indexOf('id="bm-dia"') < html.indexOf('<body'));
});

test('os slugs são os de DIAS (city.constants.ts), na mesma ordem', () => {
  const constantes = readFileSync(new URL('../src/app/modules/public/home/city/city.constants.ts', import.meta.url), 'utf8');
  const slugs = [...constantes.matchAll(/slug: "(\w+)", idx: (\d)/g)].map((m) => [m[1], Number(m[2])]);
  assert.equal(slugs.length, 7);
  for (const [slug, idx] of slugs) assert.equal(rodar(`/missas/mg/alfenas?dia=${slug}`), String(idx));
});

test('query válida, inclusive com outros parâmetros e maiúsculas', () => {
  assert.equal(rodar('/missas/sp/aparecida?dia=segunda'), '1');
  assert.equal(rodar('/missas/sp/aparecida/?utm_source=x&dia=Sabado'), '6');
});

test('ausente, inválida, repetida ou combinada com período: não marca', () => {
  for (const url of [
    '/missas/mg/alfenas',
    '/missas/mg/alfenas?dia=',
    '/missas/mg/alfenas?dia=feriado',
    '/missas/mg/alfenas?dia=<img src=x>',
    '/missas/mg/alfenas?dia=sabado&dia=domingo',
    '/missas/mg/alfenas?dia=sabado&periodo=manha',
  ]) assert.equal(rodar(url), undefined, url);
});

test('fora da página de cidade: não marca', () => {
  for (const url of ['/?dia=sabado', '/missas/mg?dia=sabado', '/missas/mg/alfenas/matriz?dia=sabado', '/missa-sabado?dia=sabado']) {
    assert.equal(rodar(url), undefined, url);
  }
});

test('sem URLSearchParams: não faz nada e não lança', () => {
  assert.equal(rodar('/missas/mg/alfenas?dia=sabado', { semURLSearchParams: true }), undefined);
});
