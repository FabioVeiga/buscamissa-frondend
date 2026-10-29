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

1. **Cada ambiente tem o seu critério.** Staging e produção usam bases diferentes: o staging lê a API de dev (≈2.200 paróquias e 400 cidades em 28/10/2026) e a produção, a API de produção. O arquivo de proteção é gerado a partir da produção e **não vale para a base de dev** (no PR #271 o staging recusou o arquivo com 83,5% das protegidas ausentes da base). Por isso:

   | Ambiente | Workflow | Critério padrão | Variável de critério | Variável de exceção de margem |
   |---|---|---|---|---|
   | Produção (`master`) | `azure-static-web-apps-gentle-moss-*.yml` | `v8` (padrão do código) | `PRERENDER_PAROQUIAS_CRITERIO_PRODUCAO` | `PRERENDER_ACEITAR_MARGEM_PRODUCAO` |
   | Staging (`dev`) | `azure-static-web-apps-proud-glacier-*.yml` | `demanda` (fixado no workflow) | `PRERENDER_PAROQUIAS_CRITERIO_STAGING` | `PRERENDER_ACEITAR_MARGEM_STAGING` |

2. **Como a variável chega ao build.** Cada workflow mapeia as variáveis do SEU ambiente para os nomes que o código lê, no `env` do job:

   ```yaml
   # produção
   PRERENDER_PAROQUIAS_CRITERIO: ${{ vars.PRERENDER_PAROQUIAS_CRITERIO_PRODUCAO }}
   PRERENDER_ACEITAR_MARGEM: ${{ vars.PRERENDER_ACEITAR_MARGEM_PRODUCAO }}
   # staging
   PRERENDER_PAROQUIAS_CRITERIO: ${{ vars.PRERENDER_PAROQUIAS_CRITERIO_STAGING || 'demanda' }}
   PRERENDER_ACEITAR_MARGEM: ${{ vars.PRERENDER_ACEITAR_MARGEM_STAGING }}
   ```

   São **variáveis do repositório** no GitHub (Settings → Secrets and variables → Actions → Variables). Inexistente ou vazia = padrão do ambiente e nenhuma exceção. Como os nomes são diferentes, mudar uma não afeta o outro ambiente. Nenhum workflow usa os nomes sem sufixo (teste `scripts/workflows-criterio.test.mjs`).
3. **O prerender segue o registro do prebuild, não a variável.** `npm run build:prod` / `build:staging` roda prebuild (sitemap), build (prerender das rotas) e postbuild (guards) no mesmo step. Mas o `@angular/build` cria os workers de prerender com `env: { NG_ALLOWED_HOSTS }`, **sem** herdar o ambiente do build: lá dentro a variável nunca existe. Por isso o prebuild grava `.prerender-cache/criterio-prerender.json` (versão 2: critério, seleção, hash do `paroquias.json` e hash de integridade) e os workers usam só esse arquivo (`paroquiasDoDisco`). Registro ausente, de outra versão, adulterado ou de outro cache derruba o prerender, sem cair no padrão. O `verificar-prerender` valida o registro, recalcula com o ambiente do postbuild e falha se o critério ou a seleção divergirem.
4. **Os guards valem em todos os critérios.** A reversão muda a seleção, nunca desliga `verificar-dist-size` nem `verificar-prerender`. Configuração inválida (valor desconhecido, `v8` sem arquivo de proteção válido, proteção divergente da base) falha o build com **uma** mensagem, sem stack trace.
5. **Sitemap quando a API falha.** O `gerar-sitemap` não derruba o build se a busca de `{API}/sitemap.xml` falhar. Mas `public/sitemap.xml` está no `.gitignore`: no CI (checkout limpo) **não existe sitemap anterior**, e o dist sai **sem** `sitemap.xml`. Em produção o `/sitemap.xml` continua sendo servido pelo proxy Node, que o gera dinamicamente; no staging a URL fica sem arquivo até o próximo build com a API respondendo. "Sitemap anterior preservado" só acontece em build local. O registro do critério é gravado mesmo assim, a partir do cache do prebuild.

## Margem de arquivos

`verificar-dist-size` falha quando `MAX_FILES − arquivos do dist` fica abaixo de 150, nos dois ambientes.

**Exceção de emergência:** `PRERENDER_ACEITAR_MARGEM_PRODUCAO` ou `PRERENDER_ACEITAR_MARGEM_STAGING` = `<n>` (inteiro de 0 a 149) aceita margem real ≥ `n` só naquele ambiente. Valor fora disso faz o build falhar. Regras:

- uso **temporário**, só para destravar uma correção urgente; nunca escrita como valor fixo nos arquivos de workflow;
- o log do build registra a exceção e a margem observada; quem criar a variável abre, no mesmo dia, a tarefa de remoção com a causa;
- a variável é **apagada** no GitHub no primeiro build depois de resolvida a causa (remedir `ARQUIVOS_FIXOS`, regenerar a proteção ou voltar ao critério `v8`).

O staging, com a base de dev e o critério `demanda`, tem margem bem acima de 150 (≈2.700 de 4.200 arquivos) e não precisa de exceção.

## Reversão da produção

1. Criar ou alterar a variável `PRERENDER_PAROQUIAS_CRITERIO_PRODUCAO` com `demanda` (ou `qualidade`). Não precisa de commit e não afeta o staging.
2. **Hoje** a reversão também exige `PRERENDER_ACEITAR_MARGEM_PRODUCAO`: `demanda` e `qualidade` usam o teto fixo de 1.900, e com a base de 28/10/2026 (1.806 cidades) a margem fica em ~111 arquivos, abaixo da folga. Use o menor `n` que passe (ex.: `100`) e siga as regras da exceção.
3. Rodar um build de produção (push em `master`). Os workflows não têm disparo manual.
4. Conferir no log: a linha `[prerender-paroquias] critério…`, o aviso de exceção do `dist-size` e `[criterio] seleção de paróquias igual no prebuild e no postbuild`.
5. Desfazer: apagar as duas variáveis `_PRODUCAO` quando o problema da V8 for corrigido.

Para validar a V8 com dados reais sem publicar, use `npm run build:prod` local com Node 22 (o do CI) e `TZ=America/Sao_Paulo`; numa máquina com pouca memória, `NG_BUILD_MAX_WORKERS=2` evita os timeouts de 30 s por rota do prerender.

## Arquivos de dados — regeneração conjunta

Os dois são gerados fora do build, **no mesmo ciclo**, com a mesma data final de Search Console e o sitemap publicado no mesmo dia:

1. `node scripts/atualizar-demanda-paroquias.mjs …` → `scripts/data/paroquias-demanda.json`
2. `node scripts/gerar-protecao-prerender.mjs --sitemap <xml> --sitemap-url <url> --sitemap-data <AAAA-MM-DD> --gsc-paroquias <csv> --gsc-cidades <csv> --janela <inicio>:<fim> --saida scripts/data/prerender-protecao.json`

O build loga as duas janelas e avisa quando uma terminou há mais de 45 dias ou quando as datas finais divergem mais de 14 dias. Chaves protegidas ou atuais que sumiram da base acima de 2% fazem o build falhar: regenere.
