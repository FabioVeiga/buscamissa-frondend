// Decisão do guard de cobertura das páginas de cidade. Sem disco: recebe os dois
// bulks já lidos (o I/O fica em scripts/verificar-cobertura-cidades.mjs).
//
// Por que existe: até 14/10/2026 a listagem de cidade (/v2/seo/cidades, que alimenta
// o prerender de /missas/{uf}/{cidade}) cortava em 300 igrejas. Rio de Janeiro (485)
// e São Paulo (342) perdiam paróquias em silêncio — sem erro, sem aviso de build. A
// API agora tem teto de segurança com Warning; este guard é a trava ANTES do deploy.
//
// Referência: /v2/seo/paroquias (paroquias.json), que lista TODAS as paróquias ativas
// sem corte. Filtros comparados (IgrejaReadService):
//   cidades:   Ativo && !Deletado && CidadeSlug != null
//   paróquias: Ativo && !Deletado && CidadeSlug != null && Slug != null
// Logo, para cada cidade:
//   - toda paróquia do bulk TEM de estar na lista da cidade (senão: corte/perda);
//   - a lista da cidade só pode ter a mais igrejas SEM slug (fora do bulk por filtro).
// A comparação é por id, não por quantidade: mesma contagem com ids trocados falha.

/** Chave de cidade igual nos dois bulks (o backend agrupa com Uf/CidadeSlug normalizados). */
const chave = (uf, cidadeSlug) => `${String(uf).toLowerCase()}/${String(cidadeSlug).toLowerCase()}`;

const ehIdValido = (id) => Number.isInteger(id) && id > 0;

/**
 * @param {unknown} cidades    conteúdo de cidades.json
 * @param {unknown} paroquias  conteúdo de paroquias.json
 * @returns {{
 *   status: 'ok' | 'divergente' | 'inverificavel',
 *   motivo?: string,
 *   resumo: { cidades: number, paroquias: number, igrejasListadas: number, semSlug: number },
 *   problemas: Array<{ cidade: string, tipo: string, ids: number[], esperado?: number, listado?: number }>
 * }}
 */
export function verificarCoberturaCidades(cidades, paroquias) {
  const resumo = { cidades: 0, paroquias: 0, igrejasListadas: 0, semSlug: 0 };
  const inverificavel = (motivo) => ({ status: 'inverificavel', motivo, resumo, problemas: [] });

  if (!Array.isArray(cidades) || cidades.length === 0) return inverificavel('cidades.json ausente, vazio ou não é array');
  if (!Array.isArray(paroquias) || paroquias.length === 0) return inverificavel('paroquias.json ausente, vazio ou não é array');

  // Referência: ids esperados por cidade, a partir do bulk sem corte.
  const esperado = new Map();
  for (const p of paroquias) {
    const id = p?.igreja?.id;
    if (!p?.uf || !p?.cidadeSlug || !ehIdValido(id)) {
      return inverificavel(`item de paroquias.json sem uf/cidadeSlug/igreja.id válido (${JSON.stringify(p?.slug ?? null)})`);
    }
    const k = chave(p.uf, p.cidadeSlug);
    if (!esperado.has(k)) esperado.set(k, new Set());
    esperado.get(k).add(id);
    resumo.paroquias++;
  }

  const problemas = [];
  const vistas = new Set();
  for (const c of cidades) {
    if (!c?.uf || !c?.cidadeSlug || !Array.isArray(c?.igrejas)) {
      return inverificavel(`item de cidades.json sem uf/cidadeSlug/igrejas (${JSON.stringify(c?.cidadeSlug ?? null)})`);
    }
    const k = chave(c.uf, c.cidadeSlug);
    resumo.cidades++;
    vistas.add(k);

    const listados = new Set();
    const duplicados = [];
    const extrasComSlug = [];
    for (const ig of c.igrejas) {
      if (!ehIdValido(ig?.id)) return inverificavel(`igreja sem id válido em ${k}`);
      if (listados.has(ig.id)) duplicados.push(ig.id);
      listados.add(ig.id);
      resumo.igrejasListadas++;
      const noBulk = esperado.get(k)?.has(ig.id) ?? false;
      if (!noBulk) {
        if (ig.slug) extrasComSlug.push(ig.id);
        else resumo.semSlug++;
      }
    }

    const ref = esperado.get(k) ?? new Set();
    const faltando = [...ref].filter((id) => !listados.has(id));
    if (faltando.length) {
      problemas.push({ cidade: k, tipo: 'faltando', ids: faltando.sort((a, b) => a - b), esperado: ref.size, listado: listados.size });
    }
    if (extrasComSlug.length) {
      problemas.push({ cidade: k, tipo: 'fora-do-bulk', ids: extrasComSlug.sort((a, b) => a - b), esperado: ref.size, listado: listados.size });
    }
    if (duplicados.length) {
      problemas.push({ cidade: k, tipo: 'duplicado', ids: [...new Set(duplicados)].sort((a, b) => a - b) });
    }
  }

  // Cidade com paróquias no bulk e nenhuma página de cidade: a cidade inteira sumiu.
  for (const [k, ids] of esperado) {
    if (!vistas.has(k)) problemas.push({ cidade: k, tipo: 'cidade-ausente', ids: [...ids].sort((a, b) => a - b), esperado: ids.size, listado: 0 });
  }

  return { status: problemas.length ? 'divergente' : 'ok', resumo, problemas };
}

/**
 * Os dois bulks precisam ser da MESMA execução do prebuild. O download não grava
 * arquivo reprovado, mas o cache ANTERIOR fica no disco — um cidades.json novo
 * comparado com um paroquias.json de outro dia não prova nada. Retorna o motivo
 * quando a distância entre as datas passa do tolerado, ou null se está ok.
 */
export function motivoSnapshotsDesalinhados(mtimeCidadesMs, mtimeParoquiasMs, toleranciaMs = 15 * 60 * 1000) {
  if (!Number.isFinite(mtimeCidadesMs) || !Number.isFinite(mtimeParoquiasMs)) return 'data de gravação dos bulks indisponível';
  const dif = Math.abs(mtimeCidadesMs - mtimeParoquiasMs);
  if (dif > toleranciaMs) {
    return `cidades.json e paroquias.json foram gravados com ${Math.round(dif / 60000)} min de diferença — não são do mesmo download`;
  }
  return null;
}
