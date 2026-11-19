/**
 * Custo de CPU por requisição no pior manifesto (São Paulo, 509 igrejas).
 * Mede no Node (V8, mesmo motor do workerd). Serve de ordem de grandeza para o
 * limite de 10 ms de CPU do plano gratuito; a medição que vale é a do PR-10, na
 * Cloudflare.
 *
 *   npm run bench
 */
import { criarLeitorComMemoria, lerManifesto } from '../src/manifesto.mjs';
import { classificar } from '../src/rotas.mjs';
import { resolver } from '../src/resolver.mjs';
import { manifestoGrande } from '../test/helpers.mjs';

const texto = JSON.stringify(manifestoGrande(509));
const slugs = Object.keys(JSON.parse(texto).paroquias);
const ITERACOES = 2000;

function medir(nome, fn) {
  for (let i = 0; i < 200; i++) fn(i); // aquecimento
  const amostras = [];
  for (let i = 0; i < ITERACOES; i++) {
    const t0 = performance.now();
    fn(i);
    amostras.push(performance.now() - t0);
  }
  amostras.sort((a, b) => a - b);
  const q = (p) => (amostras[Math.floor(p * (amostras.length - 1))] * 1000).toFixed(0);
  console.log(`${nome.padEnd(42)} p50 ${q(0.5).padStart(5)} µs   p99 ${q(0.99).padStart(5)} µs   máx ${q(1).padStart(5)} µs`);
}

console.log(`manifesto: ${slugs.length + JSON.parse(texto).semPagina.length} igrejas, ${(Buffer.byteLength(texto) / 1024).toFixed(1)} KB\n`);

medir('parse + validação do manifesto', () => {
  const r = lerManifesto(texto, { uf: 'sp', cidade: 'sao-paulo' });
  if (!r.ok) throw new Error('manifesto inválido');
});

const { manifesto } = lerManifesto(texto, { uf: 'sp', cidade: 'sao-paulo' });
medir('classificar + resolver (manifesto pronto)', (i) => {
  const rota = classificar(`/paroquia/sp/sao-paulo/${slugs[i % slugs.length]}`);
  resolver(rota, manifesto);
});

medir('requisição completa, isolate frio (sem rede)', (i) => {
  const rota = classificar(`/paroquia/sp/sao-paulo/${slugs[i % slugs.length]}`);
  const r = lerManifesto(texto, { uf: rota.uf, cidade: rota.cidade });
  resolver(rota, r.manifesto);
});

const ler = criarLeitorComMemoria();
medir('requisição completa, isolate quente (memória)', (i) => {
  const rota = classificar(`/paroquia/sp/sao-paulo/${slugs[i % slugs.length]}`);
  // Texto novo a cada vez, como sai do cache da borda; o conteúdo é o mesmo.
  const r = ler('ativo/sp/sao-paulo.json', texto.slice(0), { uf: rota.uf, cidade: rota.cidade });
  resolver(rota, r.manifesto);
});
