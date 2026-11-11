/**
 * Orçamento de ARQUIVOS do dist — fonte única para o guard do postbuild
 * (`verificar-dist-size.mjs`) e para o teto dinâmico de paróquias do prerender
 * (`selecionar-paroquias-prerender.mjs`). Antes o MAX_FILES morava só no guard e a
 * seleção usava um teto fixo de 1.900 paróquias: cada cidade nova somava um arquivo e o
 * build estourava sem que a seleção soubesse.
 *
 * Depende só de `node:fs`/`node:path` porque também roda dentro do bundle server
 * (`app.routes.server.ts` → `paroquiasDoDisco`).
 */
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Rede de segurança do guard (ver o histórico em `verificar-dist-size.mjs`): 4.200
 * arquivos projetam ~162 s de distribuição, 81% do teto de 200 s. Só sobe com medição
 * nova do tempo real de distribuição nos logs do Actions.
 */
export const MAX_FILES = 4200;

/**
 * Margem que o teto dinâmico de paróquias reserva abaixo de MAX_FILES. Absorve o
 * crescimento de cidades entre o prebuild e o próximo ciclo de demanda e a variação de
 * arquivos não-HTML (chunks) entre builds.
 */
export const FOLGA_ARQUIVOS = 150;

/**
 * Arquivos do dist que não são página de cidade nem de paróquia: assets (JS, CSS,
 * fontes, imagens), páginas estáticas, /missas/{uf}, a árvore /missa-{dia}[/{uf}] e o
 * 404. É uma medição, não uma derivação: os chunks JS dependem do código, e os hubs
 * `/missas/{uf}` e `/missa-{dia}/{uf}` dependem dos dados. O guard do postbuild mede o
 * valor real a cada build (`medirFixos`) e o mostra quando a margem falha.
 *
 * Histórico:
 *   - 383 — build de produção de 26/10/2026 (run 40231569289):
 *           3.923 = 1.900 paróquias + 1.640 cidades + 383 fixos.
 *   - 384 — build de produção do PR #275 em 03/11/2026 (run 41640941772):
 *           4.051 = 1.734 paróquias + 1.933 cidades + 384 fixos
 *           (237 rotas fixas + 147 arquivos que não são rota). Mesmos dados e mesmas
 *           3.904 rotas do build anterior (run 41558988041, 383 fixos); a unidade a
 *           mais é um chunk JS: o #257 passou a importar `city/city.constants.ts` em
 *           `intencao.component.ts`, e o esbuild separou o módulo, agora usado por dois
 *           chunks lazy, num chunk próprio (51 → 52 chunks lazy).
 *   - 386 — build de produção do PR #287 em 08/11/2026 (run 42525794520):
 *           4.052 = 1.661 paróquias + 2.005 cidades + 386 fixos
 *           (237 rotas fixas + 149 arquivos que não são rota). As rotas e os chunks JS
 *           não mudaram; as 2 unidades a mais são `prerender-shared-*.css` (18 → 20): o
 *           redesenho da página de paróquia criou novas combinações de blocos de estilo,
 *           e o dedupe-prerender-css emite um arquivo por combinação.
 *   - 387 — build de produção do PR #303 em 11/11/2026 (run 43015961609):
 *           4.051 = 1.476 paróquias + 2.188 cidades + 387 fixos. A unidade a mais é
 *           um chunk JS: `cep-redirect.component.ts` passou a importar o
 *           `NotFoundComponent`, que também é carregado lazy pela rota `**`, e o
 *           esbuild separou o módulo num chunk próprio (margem real 149 < 150).
 */
export const ARQUIVOS_FIXOS = 387;

/**
 * Exceção à folga mínima: `PRERENDER_ACEITAR_MARGEM=<n>` aceita UMA margem real entre
 * `n` e a folga, com `0 ≤ n < FOLGA_ARQUIVOS`. Serve para não travar uma correção
 * urgente quando os fixos cresceram; o log registra a exceção e a margem observada.
 */
export const VARIAVEL_EXCECAO_MARGEM = 'PRERENDER_ACEITAR_MARGEM';

/**
 * Decide se a margem real (MAX_FILES − arquivos do dist) passa. Abaixo da folga falha,
 * salvo exceção válida; acima de MAX_FILES falha sempre (o guard trata à parte).
 */
export function avaliarMargem({ arquivos, env = process.env, maxArquivos = MAX_FILES, folga = FOLGA_ARQUIVOS }) {
  const margem = maxArquivos - arquivos;
  if (margem >= folga) return { ok: true, margem };
  const bruto = env[VARIAVEL_EXCECAO_MARGEM];
  if (bruto === undefined || bruto === '') {
    return { ok: false, margem, motivo: `margem real de ${margem} arquivos abaixo da folga de ${folga}` };
  }
  const minimo = Number(bruto);
  if (!Number.isInteger(minimo) || minimo < 0 || minimo >= folga) {
    return { ok: false, margem, motivo: `${VARIAVEL_EXCECAO_MARGEM}="${bruto}" inválido (inteiro entre 0 e ${folga - 1})` };
  }
  if (margem < minimo) {
    return { ok: false, margem, motivo: `margem real de ${margem} abaixo até da exceção ${VARIAVEL_EXCECAO_MARGEM}=${minimo}` };
  }
  return { ok: true, margem, excecao: minimo };
}

/** Contagem recursiva de arquivos e bytes de um diretório — a regra do guard. */
export function medirDiretorio(dir) {
  let bytes = 0;
  let arquivos = 0;
  for (const nome of readdirSync(dir)) {
    const full = join(dir, nome);
    const st = statSync(full);
    if (st.isDirectory()) {
      const sub = medirDiretorio(full);
      bytes += sub.bytes;
      arquivos += sub.arquivos;
    } else {
      bytes += st.size;
      arquivos++;
    }
  }
  return { bytes, arquivos };
}

/**
 * Fixos REAIS de um dist já gerado: tudo o que não é `missas/{uf}/{cidade}/index.html`
 * nem `paroquia/{uf}/{cidade}/{slug}/index.html`. O hub `/missas/{uf}` é fixo. É o
 * número a comparar com ARQUIVOS_FIXOS quando a margem real diverge da projetada.
 */
export function medirFixos(dir) {
  const { arquivos } = medirDiretorio(dir);
  const cidades = contarPaginas(join(dir, 'missas'), 2);
  const paroquias = contarPaginas(join(dir, 'paroquia'), 3);
  return { arquivos, cidades, paroquias, fixos: arquivos - cidades - paroquias };
}

/** `index.html` exatamente `niveis` diretórios abaixo de `base` (0 se não existir). */
function contarPaginas(base, niveis) {
  let entradas;
  try {
    entradas = readdirSync(base, { withFileTypes: true });
  } catch {
    return 0;
  }
  if (niveis === 0) return entradas.some((e) => e.isFile() && e.name === 'index.html') ? 1 : 0;
  return entradas
    .filter((e) => e.isDirectory())
    .reduce((total, e) => total + contarPaginas(join(base, e.name), niveis - 1), 0);
}

/** Arquivos que o dist terá: uma página por cidade e por paróquia, mais os fixos. */
export function projetarArquivos({ cidades, paroquias, fixos = ARQUIVOS_FIXOS }) {
  return fixos + cidades + paroquias;
}

/**
 * Quantas páginas de paróquia cabem mantendo a folga. Pode dar zero ou negativo: quem
 * chama decide falhar (a seleção não esconde falta de espaço).
 */
export function tetoParoquias({
  cidades,
  maxArquivos = MAX_FILES,
  folga = FOLGA_ARQUIVOS,
  fixos = ARQUIVOS_FIXOS,
}) {
  return maxArquivos - folga - fixos - cidades;
}

/**
 * Margem real que a reversão de produção (critério `demanda`/`qualidade`, teto fixo)
 * deixaria, a partir do último build V8 medido: troca as paróquias V8 pelas do teto
 * fixo e mantém o resto do dist. Com elegíveis acima do teto fixo, a reversão gera
 * exatamente `paroquiasReversao` páginas. Serve para escolher a exceção de margem NA
 * HORA da reversão: o valor cai a cada cidade nova na base.
 */
export function margemNaReversao({ arquivosV8, paroquiasV8, paroquiasReversao, maxArquivos = MAX_FILES }) {
  return maxArquivos - arquivosV8 - (paroquiasReversao - paroquiasV8);
}
