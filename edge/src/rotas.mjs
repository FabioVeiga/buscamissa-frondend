/**
 * Classificação do caminho público, sem consultar manifesto nem rede.
 *
 * Recebe `URL.pathname`, que no Worker (e no Node) já chega com `.`/`..`
 * resolvidos e com não-ASCII codificado em `%XX`. Qualquer `%` que sobre numa
 * rota tratada é inválido: slugs são ASCII e um `%2F` não pode virar separador.
 *
 * Resultados:
 *   { tipo: 'fora' }                               rota não tratada aqui → origem
 *   { tipo: 'invalida' }                           rota tratada, mas malformada → 404
 *   { tipo: 'normalizar', destino }                maiúsculas ou barra final → 301
 *   { tipo: 'paroquia', uf, cidade, slug }
 *   { tipo: 'cidade', uf, cidade }                 /missas/{uf}/{cidade}
 */
import { slugValido, ufValida } from './manifesto.mjs';

const PREFIXOS = [
  { prefixo: '/paroquia/', tipo: 'paroquia', segmentos: 3 },
  { prefixo: '/missas/', tipo: 'cidade', segmentos: 2 },
];

/**
 * @param {string} pathname
 * @param {{cidades?: boolean}} [opcoes] `cidades: false` deixa `/missas/*` com a
 *        origem (a ativação das páginas de cidade é uma etapa posterior).
 */
export function classificar(pathname, opcoes = {}) {
  const cidades = opcoes.cidades === true;
  const minusculoTodo = pathname.toLowerCase();
  const regra = PREFIXOS.find((r) => minusculoTodo.startsWith(r.prefixo));
  if (!regra) return { tipo: 'fora' };
  if (regra.tipo === 'cidade' && !cidades) return { tipo: 'fora' };

  let resto = pathname.slice(regra.prefixo.length);
  let precisaNormalizar = false;

  if (resto.endsWith('/')) {
    resto = resto.slice(0, -1);
    precisaNormalizar = true;
  }
  if (resto.includes('%')) return { tipo: 'invalida' };

  const minusculo = resto.toLowerCase();
  if (minusculo !== resto) precisaNormalizar = true;
  if (!pathname.startsWith(regra.prefixo)) precisaNormalizar = true;

  const partes = minusculo.split('/');

  // /missas/{uf} (hub do estado) e /missas/{uf}/{cidade}/... não são desta camada.
  if (regra.tipo === 'cidade' && partes.length !== regra.segmentos) return { tipo: 'fora' };
  if (partes.length !== regra.segmentos) return { tipo: 'invalida' };

  const [uf, cidade, slug] = partes;
  if (!ufValida(uf) || !slugValido(cidade)) return { tipo: 'invalida' };
  if (regra.tipo === 'paroquia' && !slugValido(slug)) return { tipo: 'invalida' };

  const canonico = regra.tipo === 'paroquia'
    ? `/paroquia/${uf}/${cidade}/${slug}`
    : `/missas/${uf}/${cidade}`;

  if (precisaNormalizar) return { tipo: 'normalizar', destino: canonico };
  return regra.tipo === 'paroquia'
    ? { tipo: 'paroquia', uf, cidade, slug }
    : { tipo: 'cidade', uf, cidade };
}
