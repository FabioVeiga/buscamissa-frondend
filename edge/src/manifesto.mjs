/**
 * Contrato do manifesto de ativação de uma cidade: `ativo/{uf}/{cidade}.json`.
 *
 * Este módulo é a fonte única do contrato e deve ser importado tanto pelo Worker
 * (que lê) quanto pelo publicador (que grava). Não depende de nada além da
 * linguagem — sem `node:*`, sem pacotes — para rodar igual no Worker e no Node.
 * `schema/manifesto.schema.json` descreve o mesmo formato e um teste garante que
 * os dois concordam.
 *
 * Formato (esquema 1):
 *
 *   {
 *     "esquema": 1,
 *     "uf": "sp", "cidade": "sao-paulo",
 *     "versao": 42,                 // VersaoDados da cidade que este manifesto publica
 *     "execucao": "gh-123-1",       // ID da execução do publicador (rastreabilidade)
 *     "commit": "abc1234",          // commit do site usado no build
 *     "geradoEm": "2026-11-13T12:00:00.000Z",
 *     "reversao": false,            // true quando a ativação aponta para arquivos anteriores
 *     "lapide": false,              // true: cidade ficou vazia; só `redir` pode ter itens
 *     "pagina": "42-abc1234",        // opcional: lote da página /missas/{uf}/{cidade}
 *     "shell": "shell/abc1234/index.html",  // caminho do shell CSR; obrigatório se houver `semPagina`
 *     "paroquias": { "slug": "42-abc1234" },  // slug -> lote onde está o HTML
 *     "semPagina": ["slug-sem-pagina"],
 *     "redir": { "slug-antigo": "/paroquia/sp/outra-cidade/slug-novo" }
 *   }
 *
 * O manifesto guarda só o *lote* de cada página; o caminho do arquivo é sempre
 * montado por `arquivoParoquia`/`arquivoPaginaCidade` a partir de uf, cidade e
 * slug já validados. Assim um manifesto não consegue apontar para arquivo de
 * outra cidade nem para fora de `html/`, e o JSON fica com metade do tamanho.
 * Rollback é um manifesto que aponta para lotes anteriores.
 *
 * Regras que o JSON Schema não expressa e só este validador confere:
 *  - um slug aparece em no máximo uma das listas `paroquias`, `semPagina`, `redir`;
 *  - `redir` não aponta para a própria URL de origem;
 *  - `lapide` exige `paroquias`, `semPagina` e `pagina` vazios;
 *  - `semPagina` não vazio exige `shell`.
 */

export const ESQUEMA_ATUAL = 1;

/** Teto do manifesto em bytes. São Paulo (509 igrejas) mede ~26 KB; folga de ~40x. */
export const TAMANHO_MAXIMO_BYTES = 1024 * 1024;

/** As 27 UFs, em minúsculas, como aparecem na URL. */
export const UFS = Object.freeze([
  'ac', 'al', 'am', 'ap', 'ba', 'ce', 'df', 'es', 'go', 'ma', 'mg', 'ms', 'mt',
  'pa', 'pb', 'pe', 'pi', 'pr', 'rj', 'rn', 'ro', 'rr', 'rs', 'sc', 'se', 'sp', 'to',
]);
const CONJUNTO_UFS = new Set(UFS);

/** Slug de cidade ou de paróquia: minúsculas ASCII, dígitos e hífens simples. */
export const PADRAO_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TAMANHO_MAXIMO_SLUG = 200;

/** Lote: pasta imutável de uma geração, ex.: "42-abc1234" (versão-commit). */
const PADRAO_LOTE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export function loteValido(lote) {
  return typeof lote === 'string' && PADRAO_LOTE.test(lote);
}

/** Arquivo HTML de uma paróquia. Slugs nunca começam com "_", então não colidem com a página da cidade. */
export function arquivoParoquia(uf, cidade, lote, slug) {
  return `html/${uf}/${cidade}/${lote}/${slug}.html`;
}

export function arquivoPaginaCidade(uf, cidade, lote) {
  return `html/${uf}/${cidade}/${lote}/_cidade.html`;
}

/** Caminho de blob: segmentos seguros separados por "/", sem "." nem ".." isolados. */
const PADRAO_SEGMENTO_BLOB = /^[A-Za-z0-9_][A-Za-z0-9._-]*$/;
const TAMANHO_MAXIMO_CAMINHO_BLOB = 512;

const CAMPOS_PERMITIDOS = new Set([
  'esquema', 'uf', 'cidade', 'versao', 'execucao', 'commit', 'geradoEm',
  'reversao', 'lapide', 'pagina', 'shell', 'paroquias', 'semPagina', 'redir',
]);

export function ufValida(uf) {
  return typeof uf === 'string' && CONJUNTO_UFS.has(uf);
}

export function slugValido(slug) {
  return typeof slug === 'string'
    && slug.length > 0
    && slug.length <= TAMANHO_MAXIMO_SLUG
    && PADRAO_SLUG.test(slug);
}

export function caminhoBlobValido(caminho) {
  if (typeof caminho !== 'string' || caminho.length === 0 || caminho.length > TAMANHO_MAXIMO_CAMINHO_BLOB) {
    return false;
  }
  return caminho.split('/').every((seg) => PADRAO_SEGMENTO_BLOB.test(seg));
}

/** Caminho público canônico de uma paróquia. */
export function urlParoquia(uf, cidade, slug) {
  return `/paroquia/${uf}/${cidade}/${slug}`;
}

const PADRAO_DESTINO_REDIR = /^\/paroquia\/([a-z]{2})\/([^/]+)\/([^/]+)$/;

function destinoRedirValido(destino) {
  if (typeof destino !== 'string') return false;
  const m = PADRAO_DESTINO_REDIR.exec(destino);
  return m !== null && ufValida(m[1]) && slugValido(m[2]) && slugValido(m[3]);
}

function ehObjetoSimples(valor) {
  return valor !== null && typeof valor === 'object' && !Array.isArray(valor);
}

/** Lê chaves próprias sem tropeçar em `__proto__` ou em protótipos herdados. */
function entradas(obj) {
  return Object.keys(obj).map((k) => [k, obj[k]]);
}

/**
 * Valida um manifesto já desserializado.
 *
 * @param {unknown} m manifesto
 * @param {{uf?: string, cidade?: string}} [esperado] cidade de onde ele foi lido;
 *        quando informado, `uf`/`cidade` do manifesto precisam bater.
 * @returns {{ok: true, erros: []} | {ok: false, erros: string[]}}
 */
export function validarManifesto(m, esperado = {}) {
  const erros = [];
  const erro = (msg) => erros.push(msg);

  if (!ehObjetoSimples(m)) {
    return { ok: false, erros: ['manifesto não é um objeto'] };
  }

  for (const campo of Object.keys(m)) {
    if (!CAMPOS_PERMITIDOS.has(campo)) erro(`campo desconhecido: ${campo}`);
  }

  if (m.esquema !== ESQUEMA_ATUAL) erro(`esquema deve ser ${ESQUEMA_ATUAL}`);
  if (!ufValida(m.uf)) erro('uf inválida');
  if (!slugValido(m.cidade)) erro('cidade inválida');
  if (esperado.uf !== undefined && m.uf !== esperado.uf) erro('uf não corresponde ao caminho do manifesto');
  if (esperado.cidade !== undefined && m.cidade !== esperado.cidade) erro('cidade não corresponde ao caminho do manifesto');

  if (!Number.isSafeInteger(m.versao) || m.versao < 0) erro('versao deve ser inteiro >= 0');
  if (typeof m.execucao !== 'string' || !/^[A-Za-z0-9._-]{1,100}$/.test(m.execucao)) erro('execucao inválida');
  if (typeof m.commit !== 'string' || !/^[0-9a-f]{7,40}$/.test(m.commit)) erro('commit inválido');
  if (typeof m.geradoEm !== 'string' || Number.isNaN(Date.parse(m.geradoEm))) erro('geradoEm inválido');
  if (typeof m.reversao !== 'boolean') erro('reversao deve ser booleano');
  if (typeof m.lapide !== 'boolean') erro('lapide deve ser booleano');

  if (m.pagina !== undefined && !loteValido(m.pagina)) erro('pagina inválida');
  if (m.shell !== undefined && !caminhoBlobValido(m.shell)) erro('shell inválido');

  const vistos = new Map(); // slug -> lista onde apareceu
  const registrar = (slug, lista) => {
    if (vistos.has(slug)) erro(`slug "${slug}" aparece em ${vistos.get(slug)} e em ${lista}`);
    else vistos.set(slug, lista);
  };

  let qtdParoquias = 0;
  if (!ehObjetoSimples(m.paroquias)) {
    erro('paroquias deve ser objeto');
  } else {
    for (const [slug, lote] of entradas(m.paroquias)) {
      qtdParoquias++;
      if (!slugValido(slug)) { erro(`paroquias: slug inválido "${slug}"`); continue; }
      if (!loteValido(lote)) { erro(`paroquias.${slug}: lote inválido`); continue; }
      registrar(slug, 'paroquias');
    }
  }

  let qtdSemPagina = 0;
  if (!Array.isArray(m.semPagina)) {
    erro('semPagina deve ser lista');
  } else {
    for (const slug of m.semPagina) {
      qtdSemPagina++;
      if (!slugValido(slug)) { erro(`semPagina: slug inválido "${slug}"`); continue; }
      registrar(slug, 'semPagina');
    }
    if (qtdSemPagina > 0 && m.shell === undefined) erro('semPagina exige shell');
  }

  if (!ehObjetoSimples(m.redir)) {
    erro('redir deve ser objeto');
  } else {
    for (const [slug, destino] of entradas(m.redir)) {
      if (!slugValido(slug)) { erro(`redir: slug inválido "${slug}"`); continue; }
      if (!destinoRedirValido(destino)) { erro(`redir.${slug}: destino inválido`); continue; }
      if (destino === urlParoquia(m.uf, m.cidade, slug)) erro(`redir.${slug}: aponta para si mesmo`);
      registrar(slug, 'redir');
    }
  }

  if (m.lapide === true && (qtdParoquias > 0 || qtdSemPagina > 0 || m.pagina !== undefined)) {
    erro('lapide exige paroquias, semPagina e pagina vazios');
  }

  return erros.length === 0 ? { ok: true, erros: [] } : { ok: false, erros };
}

/**
 * Desserializa e valida o texto de um manifesto. Nunca lança.
 *
 * @returns {{ok: true, manifesto: object} | {ok: false, erros: string[]}}
 */
export function lerManifesto(texto, esperado = {}) {
  if (typeof texto !== 'string') return { ok: false, erros: ['manifesto vazio'] };
  // Bytes em UTF-8 >= caracteres; slugs e caminhos são ASCII, então o teto em
  // caracteres é uma aproximação suficiente e evita codificar o texto inteiro.
  if (texto.length > TAMANHO_MAXIMO_BYTES) return { ok: false, erros: ['manifesto excede o tamanho máximo'] };
  let obj;
  try {
    obj = JSON.parse(texto);
  } catch {
    return { ok: false, erros: ['manifesto não é JSON válido'] };
  }
  const r = validarManifesto(obj, esperado);
  return r.ok ? { ok: true, manifesto: obj } : { ok: false, erros: r.erros };
}

/**
 * `lerManifesto` com memória por chave: se o texto for idêntico ao da última
 * leitura bem-sucedida da mesma chave, devolve o objeto já validado sem refazer
 * parse nem validação (no manifesto de São Paulo, ~1 ms de CPU por requisição).
 * Só leituras válidas são memorizadas, e o objeto devolvido é congelado para que
 * nenhum chamador o altere entre requisições.
 *
 * No Worker a memória vive enquanto o isolate viver; não é fonte de verdade,
 * só evita trabalho repetido sobre o mesmo texto.
 */
export function criarLeitorComMemoria(maxEntradas = 256) {
  const memoria = new Map(); // chave -> { texto, manifesto }
  return function ler(chave, texto, esperado = {}) {
    const anterior = memoria.get(chave);
    if (anterior !== undefined && anterior.texto === texto) {
      // Reinsere para manter a ordem de uso (descarte do menos recente).
      memoria.delete(chave);
      memoria.set(chave, anterior);
      return { ok: true, manifesto: anterior.manifesto, memoria: true };
    }
    const r = lerManifesto(texto, esperado);
    if (!r.ok) {
      memoria.delete(chave);
      return r;
    }
    congelarProfundo(r.manifesto);
    memoria.set(chave, { texto, manifesto: r.manifesto });
    if (memoria.size > maxEntradas) memoria.delete(memoria.keys().next().value);
    return { ok: true, manifesto: r.manifesto, memoria: false };
  };
}

function congelarProfundo(obj) {
  for (const valor of Object.values(obj)) {
    if (valor !== null && typeof valor === 'object') congelarProfundo(valor);
  }
  return Object.freeze(obj);
}

/** Caminho do manifesto no contêiner. */
export function caminhoManifesto(uf, cidade) {
  return `ativo/${uf}/${cidade}.json`;
}
