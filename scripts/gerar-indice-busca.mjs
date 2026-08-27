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
 *     "b": [bairro, ...],
 *     "i": [[nome, indiceDaCidade, slug, indiceDoBairro], ...] }
 *
 * O bairro entra pelo mesmo motivo da cidade: sem ele, "Paróquia São José" na
 * mesma cidade aparece duas vezes idêntica na lista e não há como escolher. E
 * entra como TABELA deduplicada, não como string repetida em cada paróquia —
 * bairro repete muito mais que cidade (uma cidade tem dezenas de paróquias no
 * mesmo bairro), então inline custaria ~70 KB em prod contra ~15 KB assim.
 *
 * `indiceDoBairro` é -1 quando a paróquia não tem bairro cadastrado. Bairro é
 * OPCIONAL: faltar não pode tirar a paróquia do índice, só deixa a linha sem o
 * complemento.
 *
 * Best-effort de propósito: sem o cache, avisa e sai 0. A busca de CIDADES não
 * depende deste arquivo (vem do payload que a página já carrega), então a
 * ausência dele degrada a busca de igrejas, não a página — e derrubar o build por
 * causa disso seria desproporcional. Os bulks que de fato não podem faltar têm
 * piso e abortam o build no baixar-bulk-prerender.mjs.
 *
 * MODO `--api=<base>` (só desenvolvimento; ver `npm run indice:dev`)
 * -----------------------------------------------------------------
 * `npm start` é `ng serve` puro: não roda prebuild, então o índice servido é o
 * resíduo do último build. Com um índice de PROD e o `environment.ts` apontando
 * para a API de DEV, a busca lista ~2.700 paróquias que a dev não tem e o clique
 * cai em "Paróquia não encontrada" — parece bug do autocomplete, é descasamento
 * de ambiente.
 *
 * Com `--api`, o bulk é buscado daquela API direto para a MEMÓRIA. Não grava e
 * não lê `.prerender-cache/paroquias.json` de propósito: um script que
 * sobrescrevesse aquele arquivo trocaria uma armadilha por outra, rebaixando em
 * silêncio para dev o cache que o prerender local usa.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const ENTRADA = join(ROOT, '.prerender-cache', 'paroquias.json');
const SAIDA = join(ROOT, 'public', 'busca-index.json');

/**
 * Chave de deduplicação de bairro. Espelha `normalizarTexto` de
 * `src/app/shared/utils/busca.utils.ts` — não dá para importar o .ts aqui, mas as
 * duas precisam concordar, senão "Vila Nova" e "vila nova" viram dois bairros.
 * Serve só como CHAVE; o texto exibido é sempre a primeira grafia original.
 */
function normalizar(valor) {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // faixa escapada de propósito (combining marks)
    .toLowerCase()
    .replace(/['’`\-.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** `--api=<base>` → base da API de onde buscar o bulk. Ausente = ler o cache. */
function lerApiDoArgumento() {
  const arg = process.argv.slice(2).find((a) => a.startsWith('--api='));
  return arg ? arg.slice('--api='.length).replace(/\/+$/, '') : null;
}

/** Bulk direto da API, em memória. Aqui a falha é dura: quem passou `--api` pediu
    explicitamente por dados daquele ambiente, e gerar um índice do cache antigo
    seria devolver justamente o descasamento que o modo existe para evitar. */
async function baixarBulk(api) {
  const url = `${api}/v2/seo/paroquias`;
  console.log(`[indice-busca] baixando ${url} ...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} em ${url}`);
  const dados = await res.json();
  if (!Array.isArray(dados)) throw new Error(`resposta de ${url} não é um array`);
  return dados;
}

async function main() {
  const api = lerApiDoArgumento();
  if (api) {
    gerar(await baixarBulk(api), api);
    return;
  }

  if (!existsSync(ENTRADA)) {
    console.warn(
      `[indice-busca] ${ENTRADA} não existe — pulei. A busca por nome de igreja fica ` +
      `indisponível neste build; a busca por cidade continua funcionando.`,
    );
    return;
  }

  const doCache = JSON.parse(readFileSync(ENTRADA, 'utf-8'));
  if (!Array.isArray(doCache) || doCache.length === 0) {
    console.warn('[indice-busca] bulk de paróquias vazio ou inválido — pulei.');
    return;
  }
  gerar(doCache, '.prerender-cache/paroquias.json');
}

/** `origem` só aparece no log — é o que permite ver de qual ambiente veio o índice. */
function gerar(paroquias, origem) {
  // Chave da cidade = cidadeSlug + UF, NUNCA só o nome: "São José" existe em SC, SP,
  // RN... e "Santa Maria" em quase toda UF. Deduplicar por nome fundiria cidades
  // distintas num registro só e mandaria a pessoa para o estado errado.
  const cidades = [];
  const indicePorChave = new Map();
  // Bairro é deduplicado por texto normalizado (case/acento), mas o que vai para o
  // arquivo é a PRIMEIRA grafia vista — "Bela Vista" e não "bela vista".
  const bairros = [];
  const indiceBairroPorChave = new Map();
  const igrejas = [];
  let semSlug = 0;
  let semBairro = 0;

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

    const bairro = String(p?.igreja?.endereco?.bairro ?? '').trim();
    let iBairro = -1;
    if (bairro) {
      const chaveBairro = normalizar(bairro);
      iBairro = indiceBairroPorChave.get(chaveBairro) ?? -1;
      if (iBairro === -1) {
        iBairro = bairros.length;
        indiceBairroPorChave.set(chaveBairro, iBairro);
        bairros.push(bairro);
      }
    } else {
      semBairro++;
    }

    igrejas.push([nome, iCidade, slug, iBairro]);
  }

  mkdirSync(dirname(SAIDA), { recursive: true });
  const json = JSON.stringify({ c: cidades, b: bairros, i: igrejas });
  writeFileSync(SAIDA, json);

  const kb = (json.length / 1024).toFixed(0);
  const descartadas = semSlug ? ` (${semSlug} sem slug/cidade, fora do índice)` : '';
  console.log(
    `[indice-busca] ${igrejas.length} igrejas em ${cidades.length} cidades, ` +
    `${bairros.length} bairros → ` +
    `public/busca-index.json (${kb} KB)${descartadas}.`,
  );
  if (semBairro) {
    console.log(`[indice-busca] ${semBairro} igrejas sem bairro cadastrado (entram sem o complemento).`);
  }
  console.log(`[indice-busca] origem: ${origem}`);
}

main();
