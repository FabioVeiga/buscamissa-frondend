/**
 * Verificação de layout da página da paróquia em site publicado (staging ou produção).
 *
 * Abre cada paróquia em cada largura, em dois momentos:
 *   - antes:  só o HTML pré-renderizado, com JavaScript desligado;
 *   - depois: página hidratada, que é onde aparecem os elementos criados no browser.
 *
 * Detecta rolagem horizontal, elemento fora da tela, texto cortado na largura ou na
 * altura, conteúdo maior que chip de altura fixa, área de toque pequena, tamanhos
 * divergentes após a hidratação e erros do console. O que não dá para julgar por
 * medida fica nos screenshots gravados na pasta de saída.
 *
 * Uso:
 *   node scripts/verificar-layout-paroquia.mjs
 *   node scripts/verificar-layout-paroquia.mjs --base=https://buscamissa.com.br --paroquias=sp/aparecida/santuario
 *   node scripts/verificar-layout-paroquia.mjs --data=2026-11-13   (simula o "hoje" no browser)
 *   node scripts/verificar-layout-paroquia.mjs --saida=C:/temp/layout --sem-screenshots
 *
 * Sai com código 1 se houver erro. Avisos e elementos recriados só entram no relatório.
 * Precisa de Chrome instalado ou de CHROME_BIN apontando para o executável.
 */
import { spawn } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { homedir, tmpdir } from 'os';
import { join } from 'path';

const LARGURAS = [320, 360, 375, 412, 640, 768, 1024, 1280];
const ALTURA = 800;
const PAROQUIAS_PADRAO = [
  'sp/aparecida/santuario-nacional-de-nossa-senhora-da-conceicao-aparecida',
  'sp/sao-jose-dos-campos/matriz-sao-jose',
  'sp/taubate/paroquia-santa-luzia',
  'sp/votorantim/paroquia-sao-joao-batista-e-imaculada-conceicao-votorantim-sp',
  'sp/sorocaba/paroquia-nossa-senhora-da-conceicao-aparecida-cajuru-do-sul',
  'sp/campinas/paroquia-da-imaculada',
];

function opcao(nome, padrao) {
  const arg = process.argv.find((a) => a.startsWith(`--${nome}=`));
  return arg ? arg.slice(nome.length + 3) : padrao;
}
const BASE = opcao('base', 'https://proud-glacier-006788b0f.6.azurestaticapps.net').replace(/\/$/, '');
const PAROQUIAS = opcao('paroquias', PAROQUIAS_PADRAO.join(',')).split(',').filter(Boolean);
const DATA = opcao('data', '');
const SAIDA = opcao('saida', join(tmpdir(), 'buscamissa-layout'));
const SCREENSHOTS = !process.argv.includes('--sem-screenshots');

function acharChrome() {
  const candidatos = [
    process.env.CHROME_BIN,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    join(homedir(), 'AppData/Local/Google/Chrome/Application/chrome.exe'),
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);
  const achado = candidatos.find((c) => existsSync(c));
  if (!achado) throw new Error('Chrome não encontrado: defina CHROME_BIN.');
  return achado;
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

function abrirChrome() {
  const perfil = mkdtempSync(join(tmpdir(), 'layout-chrome-'));
  const proc = spawn(acharChrome(), [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${perfil}`,
    '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', 'about:blank',
  ]);
  const url = new Promise((resolver, rejeitar) => {
    let texto = '';
    proc.stderr.on('data', (d) => {
      texto += d;
      const m = texto.match(/DevTools listening on (ws:\S+)/);
      if (m) resolver(m[1]);
    });
    proc.on('exit', () => rejeitar(new Error('Chrome encerrou antes de abrir o DevTools.')));
  });
  const fechar = async () => {
    proc.kill();
    await esperar(500);
    try { rmSync(perfil, { recursive: true, force: true }); } catch { /* arquivo preso pelo Chrome */ }
  };
  return { url, fechar };
}

/** Cliente mínimo do DevTools Protocol, com o WebSocket nativo do Node. */
function conectar(url) {
  const ws = new WebSocket(url);
  let id = 0;
  const pendentes = new Map();
  const ouvintes = [];
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && pendentes.has(msg.id)) {
      const { ok, erro } = pendentes.get(msg.id);
      pendentes.delete(msg.id);
      if (msg.error) erro(new Error(msg.error.message));
      else ok(msg.result);
    } else if (msg.method) {
      ouvintes.forEach((f) => f(msg));
    }
  };
  const enviar = (method, params = {}, sessionId) => new Promise((ok, erro) => {
    pendentes.set(++id, { ok, erro });
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  return new Promise((pronto) => {
    ws.onopen = () => pronto({ enviar, ouvir: (f) => ouvintes.push(f), fechar: () => ws.close() });
  });
}

/** Roda na página. Devolve erros, avisos e métricas da largura atual. */
function auditar(momento) {
  const erros = [];
  const avisos = [];
  const de = document.documentElement;
  const nome = (e) => e.tagName.toLowerCase() + [...e.classList].filter((c) => !c.startsWith('ng-')).slice(0, 2).map((c) => '.' + c).join('');
  const texto = (e) => e.textContent.trim().replace(/\s+/g, ' ').slice(0, 40);
  const visivel = (e) => {
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden';
  };
  const ignorar = '.skip-link, .skip-link *, .church-thumb, .church-thumb *, .truncate, svg, svg *, .p-dialog, .p-dialog *';
  const celular = innerWidth < 640;

  const excesso = de.scrollWidth - de.clientWidth;
  if (excesso > 0) erros.push(`rolagem horizontal de ${excesso}px`);

  const todos = [...document.querySelectorAll('app-root *')].filter((e) => visivel(e) && !e.matches(ignorar));
  for (const e of todos) {
    const r = e.getBoundingClientRect();
    const c = getComputedStyle(e);
    if (r.right > de.clientWidth + 1 || r.left < -1) erros.push(`fora da tela: ${nome(e)} "${texto(e)}"`);
    if (e.textContent.trim()) {
      if (c.overflowX !== 'visible' && e.scrollWidth > e.clientWidth + 1) {
        erros.push(`texto cortado na largura (+${e.scrollWidth - e.clientWidth}px): ${nome(e)} "${texto(e)}"`);
      }
      if (c.overflowY !== 'visible' && e.scrollHeight > e.clientHeight + 1) {
        erros.push(`texto cortado na altura (+${e.scrollHeight - e.clientHeight}px): ${nome(e)} "${texto(e)}"`);
      }
    }
  }

  // Altura fixa: a caixa do texto precisa caber na caixa do chip ou do botão.
  for (const e of document.querySelectorAll('.mass-chip, .action-btn')) {
    if (!visivel(e)) continue;
    const faixa = document.createRange();
    faixa.selectNodeContents(e);
    const t = faixa.getBoundingClientRect();
    const b = e.getBoundingClientRect();
    if (t.left < b.left - 1 || t.right > b.right + 1 || t.top < b.top - 1 || t.bottom > b.bottom + 1) {
      erros.push(`conteúdo maior que a caixa: ${nome(e)} "${texto(e)}"`);
    }
  }

  if (celular) {
    for (const e of document.querySelectorAll('.action-btn, .church-add-contato, .ajude__saiba')) {
      if (visivel(e) && e.getBoundingClientRect().height < 44) {
        erros.push(`área de toque com ${Math.round(e.getBoundingClientRect().height)}px: ${nome(e)} "${texto(e)}"`);
      }
    }
    for (const e of document.querySelectorAll('main a, main button, app-details a, app-details button')) {
      const r = e.getBoundingClientRect();
      if (visivel(e) && r.height < 44 && !e.matches('.action-btn, .church-add-contato, .ajude__saiba')) {
        avisos.push(`alvo com ${Math.round(r.height)}px: ${nome(e)} "${texto(e)}"`);
      }
    }
  }

  // Tamanhos que precisam ser iguais, nasçam no HTML ou depois da hidratação.
  const medidas = (seletor, fn) => [...new Set([...document.querySelectorAll(seletor)].filter(visivel).map(fn))];
  const icones = medidas('.action-btn--icon', (e) => {
    const r = e.getBoundingClientRect();
    return `${Math.round(r.width)}x${Math.round(r.height)}`;
  });
  if (icones.length > 1) erros.push(`ícones com tamanhos diferentes: ${icones.join(', ')}`);
  const esperado = celular ? '44x44' : '40x40';
  if (icones.length === 1 && icones[0] !== esperado) erros.push(`ícones com ${icones[0]}, esperado ${esperado}`);

  const larguras = medidas('.schedule-row .mass-chip', (e) => {
    return e.querySelector('.mass-chip__dia, .mass-chip__num') ? null : Math.round(e.getBoundingClientRect().width);
  }).filter((v) => v !== null);
  if (larguras.length > 1) erros.push(`horários com larguras diferentes: ${larguras.join(', ')}`);

  const bordas = medidas('.schedule-row--hoje .mass-chip', (e) => getComputedStyle(e).borderTopColor);
  if (bordas.length > 1) erros.push(`chips de hoje com bordas diferentes: ${bordas.join(', ')}`);
  if (momento === 'antes' && document.querySelector('.schedule-row--hoje')) {
    avisos.push('linha de hoje presente no HTML pré-renderizado');
  }
  if (bordas.length === 1 && bordas[0] !== 'rgb(243, 160, 110)') erros.push(`borda de hoje incorreta: ${bordas[0]}`);

  // Elemento criado no browser dentro de pai pré-renderizado (ids de encapsulação diferentes).
  const recriados = {};
  for (const e of document.querySelectorAll('app-root *')) {
    const pai = e.parentElement;
    if (!pai) continue;
    const longo = e.getAttributeNames().some((a) => a.startsWith('_ngcontent-ng-'));
    const paiCurto = pai.getAttributeNames().some((a) => a.startsWith('_ngc-'));
    if (longo && paiCurto) {
      const k = nome(e);
      recriados[k] = (recriados[k] ?? 0) + 1;
    }
  }

  return {
    erros: [...new Set(erros)],
    avisos: [...new Set(avisos)],
    recriados,
    rotulos: [...document.querySelectorAll('.mass-chip__dia')].map((e) => e.textContent.trim()),
    hoje: document.querySelectorAll('.schedule-row--hoje .mass-chip').length,
    bordaHoje: bordas,
  };
}

function scriptData(iso) {
  return `(() => {
    const Real = Date, desvio = new Real(${JSON.stringify(iso + 'T12:00:00-03:00')}).getTime() - Real.now();
    class Simulada extends Real {
      constructor(...a) { if (a.length) super(...a); else super(Real.now() + desvio); }
      static now() { return Real.now() + desvio; }
    }
    window.Date = Simulada;
  })();`;
}

const OCULTAR_AVISO_COOKIES = `(() => {
  for (const e of document.querySelectorAll('app-root *')) {
    if (e.children.length || !/Sua privacidade importa/.test(e.textContent)) continue;
    let n = e;
    while (n.parentElement && getComputedStyle(n).position !== 'fixed') n = n.parentElement;
    if (n !== document.documentElement && n !== document.body) n.style.display = 'none';
  }
})()`;

async function verificarParoquia(cdp, sessao, paroquia, momento) {
  const consoleErros = [];
  const ouvinte = (msg) => {
    if (msg.sessionId !== sessao) return;
    if (msg.method === 'Runtime.exceptionThrown') consoleErros.push(msg.params.exceptionDetails.text);
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      consoleErros.push(msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 160));
    }
  };
  cdp.ouvir(ouvinte);

  const url = `${BASE}/paroquia/${paroquia}`;
  await cdp.enviar('Emulation.setScriptExecutionDisabled', { value: momento === 'antes' }, sessao);
  await cdp.enviar('Emulation.setDeviceMetricsOverride', { width: 1280, height: ALTURA, deviceScaleFactor: 1, mobile: false }, sessao);
  await cdp.enviar('Page.navigate', { url }, sessao);
  await esperar(momento === 'antes' ? 2500 : 7000);

  // A auditoria precisa de JS mesmo no "antes": religa só depois de a página ter carregado sem ele.
  if (momento === 'antes') await cdp.enviar('Emulation.setScriptExecutionDisabled', { value: false }, sessao);

  const slug = paroquia.split('/').pop().slice(0, 40);
  const resultado = { paroquia, momento, larguras: {}, console: [] };
  for (const largura of LARGURAS) {
    await cdp.enviar('Emulation.setDeviceMetricsOverride', { width: largura, height: ALTURA, deviceScaleFactor: 1, mobile: false }, sessao);
    await esperar(300);
    const { result, exceptionDetails } = await cdp.enviar('Runtime.evaluate', {
      expression: `(${auditar.toString()})(${JSON.stringify(momento)})`, returnByValue: true,
    }, sessao);
    if (exceptionDetails) throw new Error(`${paroquia}: ${exceptionDetails.exception?.description ?? exceptionDetails.text}`);
    resultado.larguras[largura] = result.value;
    if (SCREENSHOTS) {
      await cdp.enviar('Runtime.evaluate', { expression: OCULTAR_AVISO_COOKIES }, sessao);
      const { data } = await cdp.enviar('Page.captureScreenshot', { format: 'jpeg', quality: 70, captureBeyondViewport: true }, sessao);
      writeFileSync(join(SAIDA, `${slug}-${largura}-${momento}.jpg`), Buffer.from(data, 'base64'));
    }
  }
  resultado.console = [...new Set(consoleErros)];
  return resultado;
}

async function main() {
  mkdirSync(SAIDA, { recursive: true });
  const chrome = abrirChrome();
  const cdp = await conectar(await chrome.url);
  const { targetId } = await cdp.enviar('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.enviar('Target.attachToTarget', { targetId, flatten: true });
  await cdp.enviar('Page.enable', {}, sessionId);
  await cdp.enviar('Runtime.enable', {}, sessionId);
  if (DATA) await cdp.enviar('Page.addScriptToEvaluateOnNewDocument', { source: scriptData(DATA) }, sessionId);

  const resultados = [];
  let totalErros = 0;
  try {
    for (const paroquia of PAROQUIAS) {
      for (const momento of ['antes', 'depois']) {
        const r = await verificarParoquia(cdp, sessionId, paroquia, momento);
        resultados.push(r);
        console.log(`\n${paroquia} [${momento}]`);
        for (const [largura, v] of Object.entries(r.larguras)) {
          totalErros += v.erros.length;
          v.erros.forEach((e) => console.log(`  ERRO ${largura}px: ${e}`));
        }
        const base = r.larguras[LARGURAS[0]];
        console.log(`  recriados: ${JSON.stringify(base.recriados)} | rótulos: ${JSON.stringify(base.rotulos)} | hoje: ${base.hoje} chips ${JSON.stringify(base.bordaHoje)}`);
        r.console.forEach((c) => console.log(`  console: ${c}`));
        const avisos = [...new Set(Object.values(r.larguras).flatMap((v) => v.avisos))];
        avisos.slice(0, 6).forEach((a) => console.log(`  aviso: ${a}`));
      }
    }
  } finally {
    writeFileSync(join(SAIDA, 'relatorio.json'), JSON.stringify({ base: BASE, data: DATA || null, resultados }, null, 2));
    cdp.fechar();
    await chrome.fechar();
  }
  console.log(`\nRelatório e screenshots em ${SAIDA}`);
  console.log(totalErros ? `❌ ${totalErros} erro(s) de layout.` : '✓ Nenhum erro de layout.');
  process.exit(totalErros ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
