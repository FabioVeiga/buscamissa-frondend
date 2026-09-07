import { readdirSync, readFileSync, statSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  MAX_PAROQUIAS_PRERENDER,
  CEPS_COM_CITACAO_EXTERNA,
} from './lib/selecionar-paroquias-prerender.mjs';

/**
 * Guard-rail do prerender (Auditoria2 / Fases 2, 2.5 e 3). Roda no postbuild, depois
 * do prerender das cidades (/missas), das paróquias (/paroquia) e da HOME (raiz + /home).
 *
 * Se a API estiver com problema durante o build, o componente assa o SEU estado de
 * erro ("Não foi possível / Tentar novamente") no HTML estático — e o `ng build`
 * sai 0 mesmo assim. Sem esta trava, o site publicaria páginas de erro para o
 * Google indexar. Aqui contamos quantas páginas ficaram em estado de erro e
 * ABORTAMOS o build (exit 1) se QUALQUER seção passar do limiar.
 *
 * Não falha quando ZERO páginas foram prerenderizadas numa seção: isso é o fallback
 * seguro (API fora → getPrerenderParams vazio → segue CSR), não um erro a barrar.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Marcador do estado de erro dos componentes (botão "Tentar novamente").
const MARCADOR_ERRO = 'Tentar novamente';
// Limiar tolerado de páginas de erro (falhas transientes pontuais acontecem).
const LIMIAR = 0.02; // 2%

// Seções prerenderizadas com estado de erro auditável (city, details e home).
// 'home' cobre dist/<app>/browser/home/index.html (rota `home`). A raiz `''`
// (browser/index.html) é verificada à parte, por não ficar numa subpasta.
// 'missas' cobre também os hubs de Estado (/missas/{uf}, Fase 3). Os `missa-{dia}`
// são as landings/hubs/folhas da árvore de intenção (Fase 3), uma pasta por dia.
const DIAS_INTENCAO = ['domingo', 'segunda-feira', 'terca-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sabado'];

/**
 * Hubs de descoberta. Só `/cidades` chega a assar o marcador de erro — `/estados`
 * degrada para a lista estática de UFs e `/dias` não consome API. Entram os três
 * mesmo assim porque a checagem é barata e porque a página que HOJE não tem estado
 * de erro pode ganhar um amanhã, e ninguém lembraria de voltar aqui. O risco real
 * dos três é a PÁGINA SUMIR, coberto pela checagem de presença mais abaixo.
 */
const HUBS = ['cidades', 'estados', 'dias'];

const SECOES = ['missas', 'paroquia', 'home', ...HUBS, ...DIAS_INTENCAO.map((d) => `missa-${d}`)];

/** Acha dist/<app>/browser, varrendo os apps sob dist/. */
function acharBrowserDir(base) {
  if (!existsSync(base)) return null;
  for (const app of readdirSync(base)) {
    const p = join(base, app, 'browser');
    if (existsSync(p) && statSync(p).isDirectory()) return p;
  }
  return null;
}

/** Acha dist/<app>/browser/<secao>, varrendo os apps sob dist/. */
function acharPastaSecao(base, secao) {
  const browser = acharBrowserDir(base);
  if (!browser) return null;
  const p = join(browser, secao);
  return existsSync(p) && statSync(p).isDirectory() ? p : null;
}

function listarIndexHtml(dir) {
  const out = [];
  for (const nome of readdirSync(dir)) {
    const full = join(dir, nome);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...listarIndexHtml(full));
    else if (nome === 'index.html') out.push(full);
  }
  return out;
}

const distBase = join(ROOT, 'dist');
let algumFalhou = false;
let algoVerificado = false;

for (const secao of SECOES) {
  const dir = acharPastaSecao(distBase, secao);
  if (!dir) {
    console.log(`[guard-rail] nenhuma página de "${secao}" prerenderizada — nada a verificar (segue CSR).`);
    continue;
  }

  algoVerificado = true;
  const arquivos = listarIndexHtml(dir);
  const total = arquivos.length;
  let comErro = 0;
  const exemplos = [];
  for (const f of arquivos) {
    if (readFileSync(f, 'utf-8').includes(MARCADOR_ERRO)) {
      comErro++;
      if (exemplos.length < 10) exemplos.push(f.replace(dir, secao).replace('/index.html', ''));
    }
  }

  const ratio = total ? comErro / total : 0;
  const pct = (ratio * 100).toFixed(1);
  console.log(`[guard-rail] "${secao}" prerenderizadas: ${total} | em estado de erro: ${comErro} (${pct}%) | limiar: ${(LIMIAR * 100).toFixed(0)}%`);

  if (ratio > LIMIAR) {
    algumFalhou = true;
    console.error(`\n❌ [guard-rail] ${comErro}/${total} páginas de "${secao}" (${pct}%) foram assadas em ESTADO DE ERRO — acima do limiar de ${(LIMIAR * 100).toFixed(0)}%.`);
    console.error(`   Causa provável: rate limit (429) da API durante o prerender. Verifique o endpoint bulk (/v2/seo/cidades ou /v2/seo/paroquias) e o interceptor de prerender.`);
    console.error('   Exemplos:');
    for (const e of exemplos) console.error(`     - ${e}`);
  }
}

// Raiz `''` (browser/index.html): pode ser o shell CSR (pré-Fase 3) ou a home
// prerenderizada. Em qualquer caso, não pode conter o marcador de erro.
const browserDir = acharBrowserDir(distBase);
if (browserDir) {
  const raiz = join(browserDir, 'index.html');
  if (existsSync(raiz)) {
    algoVerificado = true;
    if (readFileSync(raiz, 'utf-8').includes(MARCADOR_ERRO)) {
      algumFalhou = true;
      console.error(`\n❌ [guard-rail] a raiz (index.html) foi assada em ESTADO DE ERRO.`);
    } else {
      console.log('[guard-rail] raiz (index.html): OK.');
    }
  }
}

// ── Guard-rail de PRESENÇA dos hubs ────────────────────────────────────────
//
// `/cidades`, `/estados` e `/dias` são UMA página cada, então cobertura proporcional
// não diz nada sobre elas — ou existe, ou não existe. E a ausência é silenciosa: ao
// contrário de `/missas/*` e `/paroquia/*`, estas rotas continuam no
// `navigationFallback`, então uma página faltante NÃO vira 404 chamativo. O proxy
// responde 200 com o HTML da HOME, e o Google recebe `/cidades` como mais uma cópia
// da home com canonical=/home — o mesmo estrago de 2026-08-13, sem nenhum sinal
// vermelho no build.
//
// São também as três páginas que concentram a linkagem interna para os hubs de
// estado e para as landings de dia: perder uma corta a trilha de crawl inteira.
for (const hub of HUBS) {
  const dir = acharPastaSecao(distBase, hub);
  const arquivo = dir ? join(dir, 'index.html') : null;
  if (arquivo && existsSync(arquivo)) {
    console.log(`[presença] "/${hub}": OK.`);
    continue;
  }
  algumFalhou = true;
  console.error(`\n❌ [presença] "/${hub}" NÃO foi prerenderizada — index.html ausente do dist.`);
  console.error('   A rota segue no navigationFallback, então isso não vira 404: o proxy devolve');
  console.error('   200 com o HTML da HOME e o Google indexa uma duplicata com canonical=/home.');
  console.error('   Verifique se a rota continua no app.routes.ts e se o prerender a alcançou.');
}

// `/estados` degrada para uma lista ESTÁTICA das 27 UFs quando a API falha (ver
// `aplicarFallbackEstatico` em estados.component.ts). Isso não aciona o marcador de
// erro — a página parece perfeita — mas assa links para UFs que podem não ter hub
// `/missas/{uf}` no dist, e sem os totais de cada estado. Comparar a contagem de
// links com o que o cache prometeu é o que distingue "lista real" de "fallback".
const estadosDoCache = lerCache('estados.json');
const dirEstados = acharPastaSecao(distBase, 'estados');
if (estadosDoCache && dirEstados) {
  const html = readFileSync(join(dirEstados, 'index.html'), 'utf-8');
  const links = new Set([...html.matchAll(/href="\/missas\/([a-z]{2})"/g)].map((m) => m[1]));
  const esperadas = new Set(estadosDoCache.filter((e) => e?.uf).map((e) => e.uf.toLowerCase()));
  console.log(`[estados] UFs linkadas: ${links.size} | esperadas pelo cache: ${esperadas.size}`);
  if (links.size !== esperadas.size) {
    algumFalhou = true;
    console.error(`\n❌ [estados] a página linka ${links.size} UFs, mas o cache prometeu ${esperadas.size}.`);
    console.error('   Sintoma típico do fallback estático das 27 UFs: a página assa bonita, sem');
    console.error('   marcador de erro, mas com links para estados que não têm hub no dist.');
  }
}

// ── Guard-rail de COBERTURA ────────────────────────────────────────────────
//
// O guard-rail acima só pega páginas assadas EM ERRO. Ele deixa passar o modo de
// falha que de fato chegou à produção: uma seção com ZERO páginas. Em 2026-08-13
// as 988 páginas `/missas/{uf}/{cidade}` estavam TODAS ausentes do dist de prod —
// `getPrerenderParams` caiu no fallback vazio de `/v2/seo/routes` e o build saiu 0.
// Como o proxy responde 200 com o HTML da HOME para qualquer rota não prerenderizada,
// o Google recebeu 988 cópias da home com canonical=/home.
//
// Aqui comparamos o que foi ASSADO com o que o prebuild PROMETEU (.prerender-cache).
// É auto-calibrado: não há número mágico para desatualizar.
//
// CACHE AUSENTE É FALHA DURA, não "checagem pulada". Essa era a segunda metade do
// mesmo buraco: `/paroquia/*` e `/missas/*` saíram do `navigationFallback`, então
// página não prerenderizada = 404 numa URL REAL. E o cache some exatamente quando a
// API falha — ou seja, o guard se desligava justo no cenário em que o estrago
// acontece. Sem o cache não há como afirmar que a cobertura está correta, e "não sei"
// tem que barrar o deploy, não liberá-lo.
const COBERTURA_MINIMA = 0.9;

/** Espelha exatamente o universo de app.routes.server.ts (paroquiasDoDisco/cidadesDoDisco). */
const esperadoPorSecao = {
  missas: () => {
    const cidades = lerCache('cidades.json');
    const estados = lerCache('estados.json');
    // Os DOIS são obrigatórios: cidades.json alimenta /missas/{uf}/{cidade} e
    // estados.json alimenta /missas/{uf}. Faltando um, metade da seção some do dist
    // e vira 404. Antes bastava um dos dois existir para a checagem rodar.
    if (!cidades || !estados) return null;
    // A pasta "missas" acumula os dois níveis: /missas/{uf} e /missas/{uf}/{cidade}.
    return cidades.filter((c) => c?.uf && c?.cidadeSlug).length
      + estados.filter((e) => e?.uf).length;
  },
  // Paróquias ELEGÍVEIS (com horário), limitadas pelo mesmo teto — importado de
  // selecionar-paroquias-prerender.mjs, não mais copiado à mão. Contamos só a
  // CONTAGEM, não repetimos o algoritmo de seleção: o teto é determinístico, então
  // basta `min(elegíveis, teto)` para saber quantas páginas deveriam existir — e
  // assim não há um segundo lugar com o critério de ranking, que poderia divergir em
  // silêncio do original.
  paroquia: () => {
    const lista = lerCache('paroquias.json');
    if (!lista) return null;
    const elegiveis = lista.filter(
      (p) => p?.uf && p?.cidadeSlug && p?.slug && (p?.igreja?.missas?.length ?? 0) > 0,
    ).length;
    return Math.min(elegiveis, MAX_PAROQUIAS_PRERENDER);
  },
};

function lerCache(arquivo) {
  const caminho = join(ROOT, '.prerender-cache', arquivo);
  if (!existsSync(caminho)) return null;
  try {
    return JSON.parse(readFileSync(caminho, 'utf-8'));
  } catch {
    return null;
  }
}

for (const [secao, contar] of Object.entries(esperadoPorSecao)) {
  const esperado = contar();

  // Cache ausente/ilegível: não dá para verificar cobertura, e estas seções estão
  // fora do navigationFallback. Barra o deploy.
  if (esperado === null) {
    algumFalhou = true;
    console.error(`\n❌ [cobertura] "${secao}": cache do prebuild AUSENTE ou ilegível em .prerender-cache/.`);
    console.error('   Sem ele não há como afirmar que as páginas desta seção foram geradas — e como');
    console.error('   ela está fora do navigationFallback, cada página faltante é 404 numa URL real.');
    console.error('   Rode o prebuild (scripts/baixar-bulk-prerender.mjs) antes do build.');
    continue;
  }

  // Zero prometido também barra: nenhum ambiente real tem zero cidade ou zero
  // paróquia, então isso é sintoma de cache corrompido, não estado legítimo.
  if (esperado === 0) {
    algumFalhou = true;
    console.error(`\n❌ [cobertura] "${secao}": o cache do prebuild prometeu ZERO páginas.`);
    console.error('   Nenhum ambiente real tem essa seção vazia — cache corrompido ou API degradada.');
    continue;
  }

  const dir = acharPastaSecao(distBase, secao);
  const gerado = dir ? listarIndexHtml(dir).length : 0;
  const ratio = gerado / esperado;
  console.log(
    `[cobertura] "${secao}": ${gerado}/${esperado} páginas (${(ratio * 100).toFixed(1)}%) | mínimo: ${(COBERTURA_MINIMA * 100).toFixed(0)}%`,
  );

  if (ratio < COBERTURA_MINIMA) {
    algumFalhou = true;
    console.error(
      `\n❌ [cobertura] "${secao}" prerenderizou ${gerado} de ${esperado} páginas esperadas.`,
    );
    console.error('   Cada página faltante vira 200 com o HTML da HOME no proxy (duplicata para o Google).');
    console.error('   Verifique o getPrerenderParams da seção em src/app/app.routes.server.ts');
    console.error('   e se o prebuild (baixar-bulk-prerender.mjs) baixou o bulk correspondente.');
  }
}

// --- Paróquias com citação externa (ficha do Google Business Profile) ---------
//
// A checagem de cobertura acima é ESTATÍSTICA: aceita 90% e não olha QUAIS páginas
// saíram. Para estas 16 isso não basta. Elas entram no prerender por um motivo que o
// ranking de qualidade não enxerga — a ficha do Maps da paróquia aponta para
// `buscamissa.com.br/detalhes/{CEP}`, e o destino canônico precisa existir em HTML.
// 14 das 16 NÃO passavam pelo ranking (conf 0 ou 2 com poucas missas), então basta
// alguém mexer no critério de seleção para elas caírem fora outra vez, em silêncio.
//
// Aqui a exigência é nominal e binária: as 16 existem, ou o build para.
//
// CEPS_COM_CITACAO_EXTERNA agora vem de selecionar-paroquias-prerender.mjs — antes
// era copiado à mão aqui e a proteção contra divergência era de MÃO ÚNICA: um CEP
// removido lá derrubava o build (protegido), mas um CEP novo adicionado lá e
// esquecido aqui não falhava (só ficava desprotegido). Com o import, as duas listas
// são a mesma lista — não há mais direção em que possam divergir.

const paroquiasCache = lerCache('paroquias.json');
if (paroquiasCache && browserDir) {
  const normalizarCep = (cep) => String(cep ?? '').replace(/\D/g, '');
  const faltando = [];
  const naoResolvidos = [];
  /** cep → rotas canônicas resolvidas ('/paroquia/uf/cidade/slug'), para o check de redirect. */
  const rotasPorCep = new Map();

  for (const cep of CEPS_COM_CITACAO_EXTERNA) {
    // Replica EXATAMENTE a elegibilidade de paroquiasDoDisco (uf + cidadeSlug + slug +
    // ≥1 missa). Sem o critério de missa, uma paróquia protegida que perde o último
    // horário viraria "destino sem HTML" e abortaria o build — quando na verdade o
    // prerender a excluiu de propósito, porque a página não teria o conteúdo que
    // promete. Esse estado é legítimo e vira aviso em `naoResolvidos`, não falha.
    const alvos = paroquiasCache.filter(
      (p) =>
        p?.uf &&
        p?.cidadeSlug &&
        p?.slug &&
        (p?.igreja?.missas?.length ?? 0) > 0 &&
        normalizarCep(p?.igreja?.endereco?.cep) === cep,
    );
    if (alvos.length === 0) {
      naoResolvidos.push(cep);
      continue;
    }
    for (const p of alvos) {
      const rota = `paroquia/${p.uf.toLowerCase()}/${p.cidadeSlug}/${p.slug}`;
      rotasPorCep.set(cep, [...(rotasPorCep.get(cep) ?? []), `/${rota}`]);
      if (!existsSync(join(browserDir, rota, 'index.html'))) faltando.push(`${cep} → /${rota}`);
    }
  }

  algoVerificado = true;
  // Conta por CEP DISTINTO: um CEP com mais de uma paróquia (7,1% da base colide,
  // nenhum destes 16 hoje) empurra várias rotas para `faltando`, e subtrair o
  // comprimento da lista faria o número mentir — podendo até ficar negativo.
  const cepsComFalha = new Set(faltando.map((f) => f.split(' → ')[0])).size;
  console.log(
    `[citação externa] ${CEPS_COM_CITACAO_EXTERNA.length - cepsComFalha - naoResolvidos.length}/${CEPS_COM_CITACAO_EXTERNA.length} destinos canônicos prerenderizados.`,
  );

  // CEP que sumiu do cache: a paróquia foi removida, teve o CEP corrigido, ou ficou
  // sem missa (e aí é inelegível por design). Não barra o build — mas precisa ser
  // visto, porque a ficha do Maps continua apontando para a URL correspondente.
  if (naoResolvidos.length > 0) {
    console.warn(`⚠️  [citação externa] ${naoResolvidos.length} CEP(s) sem paróquia elegível no cache: ${naoResolvidos.join(', ')}`);
    console.warn('   A ficha do Google Maps dessas paróquias segue apontando para /detalhes/{cep}.');
    console.warn('   Confirme se a paróquia saiu da base ou apenas ficou sem horário cadastrado.');
  }

  if (faltando.length > 0) {
    algumFalhou = true;
    console.error(`\n❌ [citação externa] ${faltando.length} destino(s) canônico(s) SEM HTML:`);
    for (const f of faltando) console.error(`     ${f}`);
    console.error('   Estas paróquias têm a ficha do Google Maps apontando para o BuscaMissa e');
    console.error('   rankeiam em posição ~3. Sem o HTML, o tráfego cai no shell CSR sem canonical.');
    console.error('   Verifique CEPS_COM_CITACAO_EXTERNA em src/app/app.routes.server.ts.');
  }

  // ── 301 de /detalhes/{cep} → destino canônico ───────────────────────────────
  //
  // As 16 regras vivem à mão em src/staticwebapp.config.json, e é de propósito: um
  // 301 fica cacheado no browser de forma quase permanente, então gerar a lista em
  // build — com um fetch que pode degradar, como degradou em 12/08 — daria ao build
  // autoridade para publicar redirect errado E permanente. O preço da lista estática
  // é sair de sincronia em silêncio quando alguém renomeia um slug, e é exatamente
  // esse buraco que este bloco fecha.
  //
  // Lemos a config do DIST, não do src: assim o guard prova de quebra que o arquivo
  // chegou ao artefato que vai ser publicado.
  const caminhoConfig = join(browserDir, 'staticwebapp.config.json');
  if (!existsSync(caminhoConfig)) {
    algumFalhou = true;
    console.error('\n❌ [redirect 301] staticwebapp.config.json não está no dist.');
    console.error('   Sem ele o SWA perde routes, navigationFallback e globalHeaders de uma vez.');
    console.error('   Verifique o bloco "assets" de angular.json.');
  } else {
    const config = JSON.parse(readFileSync(caminhoConfig, 'utf8'));
    const PREFIXO = '/detalhes/';
    const regras = (config.routes ?? []).filter((r) => String(r.route ?? '').startsWith(PREFIXO));
    const cepDaRegra = (r) => String(r.route).slice(PREFIXO.length);

    const esperados = new Set(CEPS_COM_CITACAO_EXTERNA);
    const declarados = new Set(regras.map(cepDaRegra));
    const ausentes = [...esperados].filter((c) => !declarados.has(c));
    const sobrando = [...declarados].filter((c) => !esperados.has(c));
    const semStatus301 = regras.filter((r) => r.statusCode !== 301);
    const destinoErrado = [];

    for (const r of regras) {
      const rotas = rotasPorCep.get(cepDaRegra(r));
      // CEP sem paróquia elegível já virou aviso acima. Aqui não há verdade contra a
      // qual comparar o destino, então não inventamos uma falha.
      if (!rotas) continue;
      if (!rotas.includes(r.redirect)) {
        destinoErrado.push(`${r.route} → ${r.redirect} (esperado: ${rotas.join(' ou ')})`);
      }
    }

    algoVerificado = true;
    console.log(`[redirect 301] ${regras.length}/${CEPS_COM_CITACAO_EXTERNA.length} regras no artefato final.`);

    if (ausentes.length || sobrando.length || semStatus301.length || destinoErrado.length) {
      algumFalhou = true;
      console.error('\n❌ [redirect 301] regras de /detalhes divergentes em staticwebapp.config.json:');
      for (const c of ausentes) console.error(`     FALTA a regra de /detalhes/${c}`);
      for (const c of sobrando) console.error(`     SOBRA /detalhes/${c} — não está em CEPS_COM_CITACAO_EXTERNA`);
      for (const r of semStatus301) console.error(`     ${r.route} tem statusCode ${r.statusCode ?? '(ausente → vira 302)'}, e precisa ser 301`);
      for (const d of destinoErrado) console.error(`     DESTINO ERRADO: ${d}`);
      console.error('   Um 301 é cacheado pelo browser de forma quase permanente: destino errado');
      console.error('   aqui é caro de desfazer depois. Corrija src/staticwebapp.config.json.');
    }
  }
}

if (algumFalhou) {
  console.error('\n   Build abortado para não publicar páginas de erro indexáveis.\n');
  process.exit(1);
}

if (algoVerificado) console.log('✓ [guard-rail] prerender saudável.');
else console.log('[guard-rail] nada prerenderizado — nada a verificar.');
