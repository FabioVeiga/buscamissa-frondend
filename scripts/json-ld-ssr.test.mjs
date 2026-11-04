// Testes do JSON-LD contra o serializador REAL do prerender — `npm run test:scripts`.
//
// O spec do SeoService roda no navegador, onde `textContent` nunca é interpretado
// como HTML. O risco está no prerender: o `@angular/platform-server` grava o texto
// do <script> cru no arquivo, e o arquivo é lido de novo por um parser HTML (o do
// Googlebot, o do navegador). Aqui o mesmo ciclo é refeito: monta a página no DOM
// de servidor do Angular, serializa, faz o parse de novo e confere o que sobrou.
//
// Determinísticos: sem internet, API ou banco.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { transformSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

// O DominoAdapter não é exportado pelo ponto de entrada público; o chunk tem hash
// no nome, então ele é achado pelo próprio import do platform-server.mjs.
async function carregarDominoAdapter() {
  await import('@angular/compiler');
  const pkg = dirname(require.resolve('@angular/platform-server/package.json'));
  const fesm = join(pkg, 'fesm2022');
  const entrada = readFileSync(join(fesm, 'platform-server.mjs'), 'utf8');
  const chunk = entrada.match(/from '\.\/(server-[\w-]+\.mjs)'/)?.[1];
  assert.ok(chunk, 'chunk do servidor do @angular/platform-server não encontrado');
  const { DominoAdapter } = await import(pathToFileURL(join(fesm, chunk)).href);
  DominoAdapter.makeCurrent();
  return new DominoAdapter();
}

// O utilitário é TypeScript sem imports: o esbuild do próprio build do Angular remove
// os tipos, e o código testado é o mesmo arquivo que o SeoService importa.
const ts = readFileSync(join(raiz, 'src/app/shared/utils/json-ld.utils.ts'), 'utf8');
const { code: js } = transformSync(ts, { loader: 'ts', format: 'esm' });
const { serializarJsonLd } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const adapter = await carregarDominoAdapter();
const serializarAntigo = (data) => JSON.stringify(data);

const HOSTIS = [
  '</script><img id=injetado src=x onerror=alert(1)>',
  '</ScRiPt >depois',
  '<!--<script>',
  '<script>alert(1)</script>',
  'aspas "duplas" e \'simples\'',
  'barra \\ invertida e \\u003c literal',
  'Paróquia São João — Coração de Jesus 🙏',
  '',
];

// Página mínima com a forma da real: dois schemas no head, conteúdo no body.
function montarPagina(serializar, valor) {
  const doc = adapter.createHtmlDocument();
  const schemas = {
    place: { '@context': 'https://schema.org', '@type': 'Church', name: valor, description: `Pároco: ${valor}`, telephone: null },
    breadcrumb: { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: valor }] },
  };
  for (const [id, data] of Object.entries(schemas)) {
    const s = doc.createElement('script');
    s.id = `ld-${id}`;
    s.type = 'application/ld+json';
    s.textContent = serializar(data);
    doc.head.appendChild(s);
  }
  const main = doc.createElement('main');
  main.id = 'conteudo';
  main.textContent = 'Horários de missa';
  doc.body.appendChild(main);
  return { html: doc.documentElement.outerHTML, schemas };
}

function reler(html) {
  const doc = adapter.createHtmlDocument();
  doc.documentElement.innerHTML = html.replace(/^<html[^>]*>|<\/html>$/g, '');
  const blocos = [...doc.querySelectorAll('script[type="application/ld+json"]')];
  return {
    blocos,
    conteudo: doc.getElementById('conteudo')?.textContent ?? null,
    injetado: !!doc.getElementById('injetado'),
    tags: [...doc.querySelectorAll('*')].map((e) => e.tagName.toLowerCase()),
  };
}

for (const valor of HOSTIS) {
  test(`prerender com ${JSON.stringify(valor)}: script íntegro, schemas e página intactos`, () => {
    const { html, schemas } = montarPagina(serializarJsonLd, valor);
    const lido = reler(html);

    assert.equal(lido.blocos.length, 2, 'nenhum schema pode sumir');
    assert.deepEqual(
      lido.blocos.map((b) => JSON.parse(b.textContent)),
      Object.values(schemas).map((s) => JSON.parse(JSON.stringify(s))),
      'JSON.parse do HTML final devolve o objeto original',
    );
    assert.equal(lido.conteudo, 'Horários de missa', 'o resto da página continua lá');
    assert.equal(lido.injetado, false, 'nenhum elemento injetado');
    assert.deepEqual(lido.tags.filter((t) => t === 'img'), []);
  });
}

// Prova de que o teste pega o problema: com a serialização antiga, `<!--<script>`
// engole o resto da página e `</script>` chega corrompido ao Google.
test('serialização antiga: <!--<script> some com o conteúdo e o 2º schema', () => {
  const lido = reler(montarPagina(serializarAntigo, '<!--<script>').html);
  assert.equal(lido.conteudo, null);
  assert.ok(lido.blocos.length < 2);
});

test('serialização antiga: </script> não fecha o elemento, mas o valor chega como &lt;', () => {
  const lido = reler(montarPagina(serializarAntigo, '</script>x').html);
  assert.equal(lido.blocos.length, 2);
  assert.equal(JSON.parse(lido.blocos[0].textContent).name, '&lt;/script>x');
});

test('schema sem "<" sai byte a byte igual ao de antes', () => {
  const dados = { '@context': 'https://schema.org', '@type': 'Church', name: 'Paróquia Nossa Senhora Aparecida', telephone: '+551133334444' };
  assert.equal(serializarJsonLd(dados), serializarAntigo(dados));
});
