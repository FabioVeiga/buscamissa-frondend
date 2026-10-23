/**
 * Regras de 404 na borda para URLs de paróquia MORTAS — lógica pura, sem disco.
 *
 * Por que existe: o Azure SWA serve o shell CSR com 200 para toda URL de paróquia
 * sem arquivo (navigationFallback). Para as URLs mortas que o Google conhece, o
 * `staticwebapp.config.json` traz regras `{ route, statusCode: 404 }`. Medido no
 * preview do PR #228 (2026-09-28):
 *
 *   - `rewrite` + `statusCode` na mesma regra é RECUSADO pelo validador do SWA
 *     ("Status code cannot be specified for a rule with Rewrite specified") e
 *     derruba o deploy inteiro;
 *   - só `statusCode: 404` é aceito: GET responde 404 (corpo = shell), HEAD 200;
 *   - a regra SOBRESCREVE o status de um arquivo que existe: uma página válida
 *     vira 404 com o conteúdo completo. Por isso este guard existe;
 *   - a comparação é sensível a maiúsculas; barra final também casa.
 *
 * O que ele barra, em qualquer ambiente: regra fora do formato exato
 * `{ route, statusCode: 404 }`, rota fora do formato canônico, maiúsculas, barra
 * final, duplicata e config acima de 18 KB (o SWA aceita 20 KB; a folga é para os
 * redirects históricos que virão).
 *
 * O que depende do ambiente — a URL existir de novo (no bulk, no dist ou no
 * sitemap do build):
 *   - prod: ERRO. Uma paróquia que voltou a existir não pode ser forçada a 404.
 *   - staging: a regra sai do artefato, com aviso. A base de dev ainda tem
 *     paróquias que em produção estão mortas; o arquivo versionado não muda.
 */

/** Teto do staticwebapp.config.json final, em bytes (o SWA recusa acima de 20 KB). */
export const LIMITE_CONFIG_BYTES = 18 * 1024;

/** `/paroquia/{uf}/{cidade}/{slug}` — minúsculas, sem acento, sem barra final. */
const ROTA_CANONICA = /^\/paroquia\/[a-z]{2}\/[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Regras que este guard governa: toda regra sob `/paroquia/` e toda regra com
 * `statusCode: 404`. A união pega tanto a regra de paróquia com status errado
 * quanto o 404 perdido fora de `/paroquia/`.
 */
export function regras404(config) {
  return (config?.routes ?? []).filter(
    (r) => String(r?.route ?? '').startsWith('/paroquia/') || r?.statusCode === 404,
  );
}

export const AMBIENTES = ['staging', 'prod'];

/**
 * Onde a rota existe no build — comparação EXATA de caminho, nunca por prefixo:
 * `/paroquia/sp/santos/catedral` não colide com `/paroquia/sp/santos/catedral-2`.
 *
 * @returns {Array<'bulk'|'dist'|'sitemap'>} vazio = sem colisão
 */
export function colisoesDaRota(rota, { bulk, sitemap, existeNoDist }) {
  return [
    bulk.has(rota) && 'bulk',
    existeNoDist(rota) && 'dist',
    sitemap.has(rota) && 'sitemap',
  ].filter(Boolean);
}

/**
 * @param {object} p
 * @param {object} p.config                  staticwebapp.config.json já parseado
 * @param {'staging'|'prod'} p.ambiente      explícito; qualquer outro valor é erro
 * @param {Set<string>} p.bulk               URLs `/paroquia/...` do bulk do build
 * @param {Set<string>} p.sitemap            caminhos `/paroquia/...` do sitemap do build
 * @param {(rota: string) => boolean} p.existeNoDist
 * @param {(config: object) => number} p.bytesFinais  tamanho do arquivo que será publicado
 * @returns {{
 *   erros: string[], avisos: string[], config: object, removidas: string[],
 *   colisoes: Array<{ rota: string, onde: string[] }>, semColisao: string[]
 * }}
 */
export function verificar404Borda({ config, ambiente, bulk, sitemap, existeNoDist, bytesFinais }) {
  if (!AMBIENTES.includes(ambiente)) {
    return {
      erros: [`ambiente inválido: ${JSON.stringify(ambiente)} — use "staging" ou "prod"`],
      avisos: [], config, removidas: [], colisoes: [], semColisao: [],
    };
  }

  const erros = [];
  const avisos = [];
  const removidas = [];
  const colisoes = [];
  const semColisao = [];
  const vistas = new Set();

  for (const regra of regras404(config)) {
    const rota = String(regra?.route ?? '');
    const chaves = Object.keys(regra ?? {}).sort().join(',');

    if (chaves !== 'route,statusCode') {
      erros.push(`${rota}: a regra deve ter só "route" e "statusCode" (tem: ${chaves})`);
    }
    if (regra?.statusCode !== 404) {
      erros.push(`${rota}: statusCode deve ser 404 (é ${JSON.stringify(regra?.statusCode)})`);
    }
    if (rota !== rota.toLowerCase()) erros.push(`${rota}: rota com maiúsculas`);
    if (rota.endsWith('/')) erros.push(`${rota}: rota com barra final`);
    if (!ROTA_CANONICA.test(rota)) erros.push(`${rota}: fora do formato /paroquia/{uf}/{cidade}/{slug}`);
    if (vistas.has(rota)) erros.push(`${rota}: duplicada`);
    vistas.add(rota);

    const onde = colisoesDaRota(rota, { bulk, sitemap, existeNoDist });
    if (onde.length === 0) {
      semColisao.push(rota);
      continue;
    }
    colisoes.push({ rota, onde });

    const motivo = `${rota}: existe no build (${onde.join(', ')})`;
    if (ambiente === 'prod') erros.push(`${motivo} — uma paróquia válida seria forçada a 404`);
    else {
      avisos.push(`${motivo} — regra removida do artefato de ${ambiente}`);
      removidas.push(rota);
    }
  }

  const final = removidas.length
    ? { ...config, routes: config.routes.filter((r) => !removidas.includes(r?.route)) }
    : config;

  const bytes = bytesFinais(final);
  if (bytes > LIMITE_CONFIG_BYTES) {
    erros.push(`staticwebapp.config.json com ${bytes} B — acima do teto de ${LIMITE_CONFIG_BYTES} B`);
  }

  return { erros, avisos, config: final, removidas, colisoes, semColisao };
}
