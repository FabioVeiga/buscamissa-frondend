# Prerender de paróquias — contrato operacional

Como o build decide **quais paróquias** ganham HTML prerenderizado, e o que fazer quando algo foge do normal. Código: `scripts/lib/selecionar-paroquias-prerender.mjs` e `scripts/lib/orcamento-arquivos.mjs`.

## Critério

`PRERENDER_PAROQUIAS_CRITERIO` aceita três valores; sem a variável vale `CRITERIO_PADRAO` (no código). Qualquer outro valor derruba o build.

| Valor | Seleção | Teto de paróquias | Exige |
|---|---|---|---|
| `v8` | piso estreito → citação → protegidas → demanda → atuais → qualidade | dinâmico: `MAX_FILES − 150 − fixos − cidades` | `scripts/data/prerender-protecao.json` válido |
| `demanda` | piso completo → citação → demanda → qualidade | fixo, 1.900 | `scripts/data/paroquias-demanda.json` (sem ele cai em `qualidade`) |
| `qualidade` | piso completo → citação → qualidade | fixo, 1.900 | nada |

## Regras por ambiente

1. **Produção (`master`) e staging (`dev`) usam o mesmo critério**, o padrão do código. Os workflows não definem a variável.
2. **A variável vale para o workflow inteiro.** Prebuild (sitemap), prerender (rotas) e postbuild (guards) leem o critério cada um por si. O prebuild grava `.prerender-cache/criterio-prerender.json` e o `verificar-prerender` falha se o postbuild calcular outro critério ou outra seleção.
3. **Os guards valem em todos os critérios.** A reversão muda a seleção, nunca desliga `verificar-dist-size` nem `verificar-prerender`.
4. Se a busca do sitemap da API falhar, o build segue com o sitemap anterior e o registro do critério é gravado do mesmo jeito, a partir do cache.

## Margem de arquivos

`verificar-dist-size` falha quando `MAX_FILES − arquivos do dist` fica abaixo de 150.

**Exceção de emergência:** `PRERENDER_ACEITAR_MARGEM=<n>` (inteiro de 0 a 149) aceita margem real ≥ `n`. Regras:

- só para destravar uma correção urgente, definida no disparo do workflow, nunca fixa no arquivo do workflow;
- o log registra a exceção e a margem observada; quem usar abre a tarefa de remoção no mesmo dia;
- removida no primeiro build depois de resolvida a causa (remedir `ARQUIVOS_FIXOS` ou regenerar a proteção).

## Reversão

- Problema na seleção V8 → `PRERENDER_PAROQUIAS_CRITERIO=demanda` (ou `qualidade`) no workflow inteiro.
- **Atenção:** `demanda` e `qualidade` usam o teto fixo de 1.900. Com a base de 28/10/2026 (1.806 cidades) isso dá margem de ~111 arquivos e o guard reprova. Reverter, hoje, exige também a exceção de margem e segue o procedimento de emergência acima.

## Arquivos de dados — regeneração conjunta

Os dois são gerados fora do build, **no mesmo ciclo**, com a mesma data final de Search Console e o sitemap publicado no mesmo dia:

1. `node scripts/atualizar-demanda-paroquias.mjs …` → `scripts/data/paroquias-demanda.json`
2. `node scripts/gerar-protecao-prerender.mjs --sitemap <xml> --sitemap-url <url> --sitemap-data <AAAA-MM-DD> --gsc-paroquias <csv> --gsc-cidades <csv> --janela <inicio>:<fim> --saida scripts/data/prerender-protecao.json`

O build loga as duas janelas e avisa quando uma terminou há mais de 45 dias ou quando as datas finais divergem mais de 14 dias. Chaves protegidas ou atuais que sumiram da base acima de 2% fazem o build falhar: regenere.
