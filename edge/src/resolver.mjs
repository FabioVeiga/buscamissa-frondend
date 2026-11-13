/**
 * Decide o que servir para uma rota já classificada, dado o manifesto da cidade.
 * Função pura: não lê rede nem cache. O Worker executa a decisão.
 *
 * `manifesto` é `null` quando não existe manifesto para a cidade (cidade ainda
 * não migrada) — nesse caso a resposta continua vindo da origem (SWA), que é o
 * comportamento de hoje. Manifesto ilegível é tratado pelo Worker, também
 * caindo na origem.
 *
 * Decisões:
 *   { acao: 'origem', motivo }
 *   { acao: 'html', arquivo }                  200, página publicada
 *   { acao: 'shell', arquivo }                 200, igreja sem página: shell CSR + noindex
 *   { acao: 'redirecionar', destino, status }  301
 *   { acao: 'nao-encontrada' }                 404 (o Worker serve o /404.html da origem)
 */
import { arquivoPaginaCidade, arquivoParoquia } from './manifesto.mjs';

export function resolver(rota, manifesto) {
  switch (rota.tipo) {
    case 'fora':
      return { acao: 'origem', motivo: 'rota-fora' };
    case 'invalida':
      return { acao: 'nao-encontrada' };
    case 'normalizar':
      return { acao: 'redirecionar', destino: rota.destino, status: 301 };
    case 'paroquia':
      return resolverParoquia(rota, manifesto);
    case 'cidade':
      return resolverCidade(rota, manifesto);
    default:
      return { acao: 'origem', motivo: 'rota-desconhecida' };
  }
}

function resolverParoquia(rota, m) {
  if (m === null) return { acao: 'origem', motivo: 'sem-manifesto' };
  const { slug } = rota;

  if (Object.hasOwn(m.paroquias, slug)) {
    return { acao: 'html', arquivo: arquivoParoquia(rota.uf, rota.cidade, m.paroquias[slug], slug) };
  }
  if (m.semPagina.includes(slug)) {
    return { acao: 'shell', arquivo: m.shell };
  }
  if (Object.hasOwn(m.redir, slug)) {
    return { acao: 'redirecionar', destino: m.redir[slug], status: 301 };
  }
  return { acao: 'nao-encontrada' };
}

function resolverCidade(rota, m) {
  if (m === null) return { acao: 'origem', motivo: 'sem-manifesto' };
  if (m.pagina !== undefined) return { acao: 'html', arquivo: arquivoPaginaCidade(rota.uf, rota.cidade, m.pagina) };
  // Cidade que ficou vazia: a página da cidade também deixa de existir.
  if (m.lapide) return { acao: 'nao-encontrada' };
  // O publicador ainda não gerencia a página desta cidade.
  return { acao: 'origem', motivo: 'cidade-sem-pagina-publicada' };
}
