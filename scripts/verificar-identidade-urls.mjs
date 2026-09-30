import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

/**
 * Guard de IDENTIDADE E URL das paróquias — quatro verificações, todas em
 * **WARNING MODE**: reportam e seguem (exit 0). Nunca alteram dado, slug, sitemap
 * ou redirect.
 *
 * Por que existir: a URL pública de uma paróquia é a tripla derivada
 * `(Uf, CidadeSlug, Slug)`, e ela NÃO é única em nenhuma camada. Não há índice
 * único no banco — as três colunas são LONGTEXT e estão em duas tabelas (Slug em
 * Igrejas, Uf/CidadeSlug em Enderecos), combinação que o MySQL não indexa —, e a
 * unicidade só é checada na escrita, com um `AnyAsync` ANTES do insert, dentro do
 * escopo `(Uf, CidadeSlug)`. Quando uma edição muda a cidade de uma igreja ATIVA,
 * o `CidadeSlug` é regravado mas o `Slug` é congelado de propósito (para não
 * quebrar link já compartilhado), e o slug antigo passa a viver num escopo novo
 * onde ninguém reverificou nada.
 *
 * Isso não é passivo histórico: em 10/09/2026 nasceu uma colisão nova, quando a
 * cidade do id 2109 foi corrigida (corretamente) para São Paulo e bateu com o
 * id 457, que ocupava `/paroquia/sp/sao-paulo/paroquia-cristo-rei` desde
 * novembro de 2025. Entre 07/09 e 11/09 as colisões foram de 3 para 4 enquanto a
 * base ia de 5.158 para 5.626 paróquias.
 *
 * As quatro verificações:
 *
 *   1. URL pública duplicada   — duas paróquias na mesma `(Uf, CidadeSlug, Slug)`.
 *   2. cidadeSlug divergente   — `CidadeSlug` != slug de `Localidade`.
 *   3. `<loc>` duplicado       — a mesma URL submetida duas vezes no sitemap.
 *   4. URL órfã / soft-404     — URL antiga que deixou de resolver.
 *
 * MODO AVISO, e por quê: as quatro encontram casos HOJE. Um guard que aborta no
 * primeiro build impediria qualquer PR de entrar, inclusive os que vão limpar os
 * dados. A decisão de qual registro sobrevive em cada conflito é editorial e está
 * documentada na auditoria de 11/09/2026 — não cabe a um script. Este guard existe
 * para que o número PARE DE CRESCER sem ninguém ver, e para dar a lista exata a
 * quem for fazer a limpeza.
 *
 * Para tornar bloqueante depois da limpeza: trocar `ESTRITO = false` por `true`
 * (ou passar `--estrito`). A partir daí, caso novo aborta o build.
 *
 * Fonte de dados: `.prerender-cache/paroquias.json`, o bulk que
 * `baixar-bulk-prerender.mjs` já baixou no prebuild — nenhuma requisição a mais.
 * Roda DEPOIS dele e depois de `gerar-sitemap.mjs` (que é quem escreve
 * `public/sitemap.xml`). Sem os arquivos, avisa e sai 0, como os outros guards:
 * `build:dev` não tem cache e não deve quebrar por isso.
 *
 * Parâmetros (só para inspeção manual; o build não passa nenhum):
 *   --bulk=<caminho>      outro bulk que não o do cache (ex.: um baixado agora)
 *   --sitemap=<caminho>   outro XML que não `public/sitemap.xml`
 *   --estrito             aborta (exit 1) se qualquer verificação achar caso
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const args = process.argv.slice(2);
const arg = (nome) => args.find((a) => a.startsWith(`--${nome}=`))?.slice(nome.length + 3);
const ESTRITO = args.includes('--estrito');

const BULK = arg('bulk') ?? join(ROOT, '.prerender-cache', 'paroquias.json');
const SITEMAP = arg('sitemap') ?? join(ROOT, 'public', 'sitemap.xml');

/** Quantos exemplos imprimir por seção quando a lista é longa. */
const MAX_EXEMPLOS = 20;

/**
 * Espelho de `IgrejaHelper.NormalizarSlug` (api-admin, C#), que é a função
 * OFICIAL de slug do backend: NFD → remove marcas combinantes → NFC → minúsculas
 * → `[^a-z0-9]+` vira `-` → apara `-` das pontas.
 *
 * É um espelho, não a fonte: um script Node não importa C#. Existem hoje quatro
 * implementações de slug no projeto com regras diferentes (esta, a de
 * `shared/utils/busca.utils.ts`, a de `gerar-indice-busca.mjs` e a de
 * `cep-redirect.component.ts`), e unificá-las é outro PR — por isso aqui é cópia
 * declarada, como em `gerar-indice-busca.mjs`.
 *
 * A faixa de combinantes vai ESCAPADA de propósito: escrita com os caracteres
 * literais, ela é invisível no editor e qualquer normalização acidental do arquivo
 * a transformaria em regex morta, sem erro e sem teste quebrando.
 */
function normalizarSlug(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Lê o bulk; null se não existir (build:dev) ou se o conteúdo não servir. */
function lerBulk() {
  if (!existsSync(BULK)) return null;
  const dados = JSON.parse(readFileSync(BULK, 'utf-8'));
  return Array.isArray(dados) && dados.length > 0 ? dados : null;
}

/** `{uf}/{cidadeSlug}/{slug}` em minúsculas — a identidade pública de hoje. */
function chaveUrl(p) {
  return `${p.uf}/${p.cidadeSlug}/${p.slug}`.toLowerCase();
}

// ── 1. URL pública duplicada ────────────────────────────────────────────────

function verificarUrlDuplicada(bulk) {
  const porUrl = new Map();
  for (const p of bulk) {
    if (!p?.uf || !p?.cidadeSlug || !p?.slug) continue;
    const k = chaveUrl(p);
    if (!porUrl.has(k)) porUrl.set(k, []);
    porUrl.get(k).push(p);
  }

  const colisoes = [...porUrl.entries()].filter(([, v]) => v.length > 1);
  console.log(`\n[identidade] 1. URL pública duplicada (Uf + CidadeSlug + Slug)`);
  if (colisoes.length === 0) {
    console.log('   ✅ nenhuma — cada URL pertence a uma paróquia só.');
    return 0;
  }

  console.warn(`   ⚠️  WARNING: duplicate canonical parish URL — ${colisoes.length} URL(s) compartilhada(s).`);
  for (const [url, registros] of colisoes) {
    const ids = registros.map((p) => p.igreja?.id).join(', ');
    console.warn(`      /paroquia/${url}  ·  ${registros.length} paróquias  ·  ids: ${ids}`);
    for (const p of registros) {
      const i = p.igreja ?? {};
      const e = i.endereco ?? {};
      console.warn(
        `         id=${i.id} "${i.nome}" · ${e.logradouro ?? '—'}, ${e.numero ?? '—'}` +
          ` · bairro=${e.bairro || '—'} · cep=${e.cep ?? '—'} · missas=${(i.missas ?? []).length}` +
          ` · confianca=${i.statusConfianca ?? '—'}`,
      );
    }
  }
  console.warn('      → Decidir quem sobrevive é editorial: ver a auditoria de identidade/URL.');
  console.warn('      → Este guard NÃO funde, NÃO renomeia slug e NÃO cria redirect.');
  return colisoes.length;
}

// ── 2. cidadeSlug divergente de Localidade ──────────────────────────────────

function verificarCidadeSlug(bulk) {
  const divergentes = [];
  for (const p of bulk) {
    const e = p?.igreja?.endereco;
    if (!e?.localidade || !e?.cidadeSlug) continue;
    const esperado = normalizarSlug(e.localidade);
    if (esperado && e.cidadeSlug !== esperado) {
      divergentes.push({ id: p.igreja.id, localidade: e.localidade, uf: e.uf, atual: e.cidadeSlug, esperado, cep: e.cep });
    }
  }

  console.log(`\n[identidade] 2. cidadeSlug divergente de slug(Localidade)`);
  if (divergentes.length === 0) {
    console.log('   ✅ nenhum — todo cidadeSlug deriva do nome da cidade.');
    return 0;
  }

  console.warn(`   ⚠️  WARNING: cidadeSlug divergente — ${divergentes.length} registro(s).`);
  for (const d of divergentes.slice(0, MAX_EXEMPLOS)) {
    console.warn(
      `      id=${d.id} · localidade="${d.localidade}" (${d.uf}) · cep=${d.cep ?? '—'}\n` +
        `         cidadeSlug atual ... ${d.atual}\n` +
        `         esperado ........... ${d.esperado}`,
    );
  }
  if (divergentes.length > MAX_EXEMPLOS) console.warn(`      ... e ${divergentes.length - MAX_EXEMPLOS} outro(s).`);
  console.warn('      → Um cidadeSlug assim fragmenta a cidade: a página legítima deixa de listar');
  console.warn('        a paróquia e nasce uma segunda URL de cidade com o mesmo title.');
  console.warn('      → Corrigir muda URL publicada (cidade + paróquias). Não é escopo deste guard.');
  return divergentes.length;
}

// ── 3. <loc> duplicado no sitemap ───────────────────────────────────────────

function verificarSitemap() {
  console.log(`\n[identidade] 3. <loc> duplicado no sitemap`);
  if (!existsSync(SITEMAP)) {
    console.log(`   ℹ️  ${SITEMAP} não existe — nada a verificar (normal em build:dev).`);
    return 0;
  }

  const xml = readFileSync(SITEMAP, 'utf-8');
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const contagem = new Map();
  for (const loc of locs) contagem.set(loc, (contagem.get(loc) ?? 0) + 1);
  const duplicados = [...contagem.entries()].filter(([, n]) => n > 1);

  console.log(`   ${locs.length} <loc> no total, ${contagem.size} distintas.`);
  if (duplicados.length === 0) {
    console.log('   ✅ nenhuma URL submetida mais de uma vez.');
    return 0;
  }

  console.warn(`   ⚠️  WARNING: duplicate <loc> — ${duplicados.length} URL(s) submetida(s) em duplicidade.`);
  for (const [loc, n] of duplicados) console.warn(`      ${n}x  ${loc}`);
  console.warn('      → A duplicidade NASCE no SitemapController do api-public, que emite um <loc>');
  console.warn('        por IGREJA (não por URL): duas paróquias na mesma URL viram duas entradas,');
  console.warn('        cada uma com o seu próprio lastmod.');
  console.warn('      → NÃO resolver com Distinct(): isso esconderia a colisão de origem, que é');
  console.warn('        justamente o que a verificação 1 acima existe para mostrar.');
  return duplicados.length;
}

// ── 4. URL órfã / soft-404 ──────────────────────────────────────────────────

/**
 * URL que um dia resolveu uma paróquia e hoje não resolve mais.
 *
 * Como a evidência é obtida: `NomeUnico` é gerado UMA vez, na criação, como
 * `uf-localidade-nome`, e nunca é regenerado. Quando a cidade do registro muda, o
 * `NomeUnico` guarda a cidade ANTIGA — e a URL que o registro tinha naquele
 * momento era `/paroquia/{uf}/{cidade-antiga}/{slug}`. Essa URL não ganha
 * redirect: ela simplesmente deixa de resolver. E como `/paroquia/*` está dentro
 * do `navigationFallback` do `staticwebapp.config.json`, o site devolve **200 com
 * o shell CSR** (sem canonical, `robots: index, follow`, título genérico da home)
 * enquanto a API devolve 404 — o padrão exato de soft-404.
 *
 * Duas classes, deliberadamente separadas, porque a diferença decide se vale um
 * 301 depois:
 *
 *   A. ÓRFÃ PLAUSÍVEL — a cidade reconstruída existe como `cidadeSlug` real na
 *      base. A URL muito provavelmente existiu.
 *   B. ARTEFATO LEGADO — a cidade reconstruída não é slug de cidade nenhuma
 *      (ex.: `alho`, de "São João do Pau d'Alho"; `caixa-postal-93-630`). São
 *      restos do formato antigo de NomeUnico; não há evidência de que tenham sido
 *      URL pública.
 *
 * O guard NÃO inventa URL histórica e NÃO transforma NomeUnico antigo em
 * redirect: registros cujo NomeUnico não segue `uf-...` são apenas contados, sem
 * reconstrução, porque deles não se extrai cidade de forma confiável.
 */
function verificarOrfas(bulk) {
  const cidadesReais = new Set();
  for (const p of bulk) if (p?.uf && p?.cidadeSlug) cidadesReais.add(`${p.uf}/${p.cidadeSlug}`.toLowerCase());

  const plausiveis = [];
  const artefatos = [];
  let semFormatoModerno = 0;

  for (const p of bulk) {
    const i = p?.igreja;
    if (!i?.nomeUnico || !p.uf || !p.cidadeSlug || !p.slug) continue;

    const prefixo = `${p.uf}-`.toLowerCase();
    const nu = i.nomeUnico.toLowerCase();
    if (!nu.startsWith(prefixo)) {
      semFormatoModerno++;
      continue;
    }

    const resto = nu.slice(prefixo.length);
    if (resto.startsWith(`${p.cidadeSlug}-`.toLowerCase())) continue; // coerente

    const marca = `-${p.slug}`.toLowerCase();
    const corte = resto.lastIndexOf(marca);
    if (corte <= 0) continue; // sem o slug no fim, não dá para isolar a cidade
    const cidadeAntiga = resto.slice(0, corte);
    if (!cidadeAntiga || cidadeAntiga === p.cidadeSlug.toLowerCase()) continue;

    const item = {
      id: i.id,
      nome: i.nome,
      urlAntiga: `/paroquia/${p.uf}/${cidadeAntiga}/${p.slug}`.toLowerCase(),
      urlAtual: `/paroquia/${chaveUrl(p)}`,
    };
    if (cidadesReais.has(`${p.uf}/${cidadeAntiga}`.toLowerCase())) plausiveis.push(item);
    else artefatos.push(item);
  }

  console.log(`\n[identidade] 4. URL órfã / soft-404 (cidade mudou, URL antiga ficou)`);
  console.log(`   ${semFormatoModerno} registro(s) com NomeUnico em formato legado — não reconstruídos de propósito.`);
  if (plausiveis.length === 0 && artefatos.length === 0) {
    console.log('   ✅ nenhuma URL antiga reconstruível difere da atual.');
    return 0;
  }

  console.warn(`   ⚠️  WARNING: orphan parish URL — ${plausiveis.length} órfã(s) plausível(is), ${artefatos.length} artefato(s) legado(s).`);
  for (const o of plausiveis.slice(0, MAX_EXEMPLOS)) {
    console.warn(`      [A] id=${o.id} "${o.nome}"\n          antes: ${o.urlAntiga}\n          hoje:  ${o.urlAtual}`);
  }
  if (plausiveis.length > MAX_EXEMPLOS) console.warn(`      ... e ${plausiveis.length - MAX_EXEMPLOS} outra(s) da classe A.`);
  for (const o of artefatos.slice(0, 5)) console.warn(`      [B] id=${o.id} ${o.urlAntiga} (cidade não é slug real — provavelmente nunca foi URL)`);
  if (artefatos.length > 5) console.warn(`      ... e ${artefatos.length - 5} outro(s) da classe B.`);
  console.warn('      → Só a classe A é candidata a 301. A classe B NÃO deve virar redirect.');
  console.warn('      → Confirmar no Search Console antes de redirecionar qualquer uma delas.');
  return plausiveis.length;
}

// ── execução ────────────────────────────────────────────────────────────────

console.log('[identidade] guard de identidade e URL de paróquia — MODO AVISO (não bloqueia).');

const bulk = lerBulk();
let achados = 0;

if (!bulk) {
  console.log(`[identidade] ${BULK} ausente ou vazio — pulei as verificações de dados.`);
  console.log('[identidade] normal em build:dev; em staging/prod o baixar-bulk-prerender.mjs grava o cache antes daqui.');
} else {
  console.log(`[identidade] ${bulk.length} paróquias lidas de ${BULK}.`);
  achados += verificarUrlDuplicada(bulk);
  achados += verificarCidadeSlug(bulk);
  achados += verificarOrfas(bulk);
}

achados += verificarSitemap();

console.log('');
if (achados === 0) {
  console.log('[identidade] ✅ nenhum achado.');
  process.exit(0);
}

if (ESTRITO) {
  console.error(`[identidade] ❌ ${achados} achado(s) e --estrito ligado — build abortado.`);
  process.exit(1);
}

console.warn(`[identidade] ⚠️  ${achados} achado(s) — MODO AVISO, build segue.`);
console.warn('[identidade] Nada foi alterado: sem escrita em dado, slug, sitemap ou redirect.');
process.exit(0);
