/**
 * Prebuild: gera o ÍNDICE DE BUSCA de `/cidades` — o arquivo que permite procurar
 * uma paróquia pelo NOME, coisa que nenhum endpoint público faz hoje
 * (`buscar-por-filtro` exige `Uf`, e `/v2/seo/estados` não traz nome de paróquia).
 *
 * Fonte: `.prerender-cache/paroquias.json`, o bulk que `baixar-bulk-prerender.mjs`
 * JÁ baixou nesta mesma etapa de prebuild. Nenhuma requisição a mais, nenhum
 * endpoint novo — só uma redução do que já está em disco: o bulk tem ~14 MB
 * (igreja inteira, com missas, contato e endereço) e aqui viram ~380 KB só com o
 * que a busca precisa. Por isso este script roda DEPOIS do baixar-bulk.
 *
 * Formato compacto (arrays posicionais, cidade referenciada por índice) porque o
 * arquivo é baixado pelo NAVEGADOR: com chaves nomeadas e a cidade repetida em
 * cada paróquia, o mesmo conteúdo passaria de 380 KB para ~480 KB.
 *
 *   { "c": [[cidade, uf, cidadeSlug], ...],
 *     "i": [[nome, indiceDaCidade, slug], ...] }
 *
 * Best-effort de propósito: sem o cache, avisa e sai 0. A busca de CIDADES não
 * depende deste arquivo (vem do payload que a página já carrega), então a
 * ausência dele degrada a busca de igrejas, não a página — e derrubar o build por
 * causa disso seria desproporcional. Os bulks que de fato não podem faltar têm
 * piso e abortam o build no baixar-bulk-prerender.mjs.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const ENTRADA = join(ROOT, '.prerender-cache', 'paroquias.json');
const SAIDA = join(ROOT, 'public', 'busca-index.json');

function main() {
  if (!existsSync(ENTRADA)) {
    console.warn(
      `[indice-busca] ${ENTRADA} não existe — pulei. A busca por nome de igreja fica ` +
      `indisponível neste build; a busca por cidade continua funcionando.`,
    );
    return;
  }

  const paroquias = JSON.parse(readFileSync(ENTRADA, 'utf-8'));
  if (!Array.isArray(paroquias) || paroquias.length === 0) {
    console.warn('[indice-busca] bulk de paróquias vazio ou inválido — pulei.');
    return;
  }

  // Chave da cidade = cidadeSlug + UF, NUNCA só o nome: "São José" existe em SC, SP,
  // RN... e "Santa Maria" em quase toda UF. Deduplicar por nome fundiria cidades
  // distintas num registro só e mandaria a pessoa para o estado errado.
  const cidades = [];
  const indicePorChave = new Map();
  const igrejas = [];
  let semSlug = 0;

  for (const p of paroquias) {
    const slug = p?.slug;
    const cidadeSlug = p?.cidadeSlug;
    const uf = String(p?.uf ?? '').toLowerCase();
    const nome = p?.igreja?.nome;
    // Slugs SEMPRE os do backend. Gerar slug no cliente foi o que produzia
    // `itapejara-doeste` (404) no lugar de `itapejara-d-oeste`. Sem os três, a
    // paróquia não tem URL canônica montável e fica fora do índice.
    if (!slug || !cidadeSlug || !uf || !nome) {
      semSlug++;
      continue;
    }

    const chave = `${uf}/${cidadeSlug}`;
    let iCidade = indicePorChave.get(chave);
    if (iCidade === undefined) {
      iCidade = cidades.length;
      indicePorChave.set(chave, iCidade);
      cidades.push([p.igreja?.endereco?.localidade ?? cidadeSlug, uf, cidadeSlug]);
    }

    igrejas.push([nome, iCidade, slug]);
  }

  mkdirSync(dirname(SAIDA), { recursive: true });
  const json = JSON.stringify({ c: cidades, i: igrejas });
  writeFileSync(SAIDA, json);

  const kb = (json.length / 1024).toFixed(0);
  const descartadas = semSlug ? ` (${semSlug} sem slug/cidade, fora do índice)` : '';
  console.log(
    `[indice-busca] ${igrejas.length} igrejas em ${cidades.length} cidades → ` +
    `public/busca-index.json (${kb} KB)${descartadas}.`,
  );
}

main();
