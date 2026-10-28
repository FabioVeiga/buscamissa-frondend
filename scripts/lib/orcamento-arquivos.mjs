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
 * 404. Medido no build de produção de 26/10/2026 (run 40231569289):
 *
 *   3.923 arquivos = 1.900 paróquias + 1.640 cidades + 383 fixos
 *
 * É uma medição, não uma derivação: os chunks variam um pouco de build para build.
 * Por isso o guard do postbuild compara a projeção com a contagem real e avisa quando
 * divergem (ver `verificar-dist-size.mjs`).
 */
export const ARQUIVOS_FIXOS = 383;

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
