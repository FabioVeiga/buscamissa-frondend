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

1. **Produção (`master`) e staging (`dev`) usam o mesmo critério**: o padrão do código, salvo reversão.
2. **Como a variável chega ao build.** Os dois workflows (`azure-static-web-apps-gentle-moss-*.yml` e `…-proud-glacier-*.yml`) declaram no `env` do job:

   ```yaml
   PRERENDER_PAROQUIAS_CRITERIO: ${{ vars.PRERENDER_PAROQUIAS_CRITERIO }}
   PRERENDER_ACEITAR_MARGEM: ${{ vars.PRERENDER_ACEITAR_MARGEM }}
   ```

   São **variáveis do repositório** no GitHub (Settings → Secrets and variables → Actions → Variables). Variável inexistente ou vazia chega como texto vazio, que o código trata como "não definida": critério padrão e nenhuma exceção. As variáveis são do repositório inteiro, então valem igualmente para produção e staging.
3. **A variável vale para todas as etapas.** `npm run build:prod` / `build:staging` roda prebuild (sitemap), build (prerender das rotas) e postbuild (guards) no mesmo step, com o mesmo ambiente. Mesmo assim cada etapa recalcula o critério; o prebuild grava `.prerender-cache/criterio-prerender.json` e o `verificar-prerender` falha se o postbuild chegar a outro critério ou outra seleção.
4. **Os guards valem em todos os critérios.** A reversão muda a seleção, nunca desliga `verificar-dist-size` nem `verificar-prerender`. Configuração inválida (valor desconhecido, `v8` sem arquivo de proteção válido) falha o build com a mensagem do erro.
5. **Sitemap quando a API falha.** O `gerar-sitemap` não derruba o build se a busca de `{API}/sitemap.xml` falhar. Mas `public/sitemap.xml` está no `.gitignore`: no CI (checkout limpo) **não existe sitemap anterior**, e o dist sai **sem** `sitemap.xml`. Em produção o `/sitemap.xml` continua sendo servido pelo proxy Node, que o gera dinamicamente; no staging a URL fica sem arquivo até o próximo build com a API respondendo. "Sitemap anterior preservado" só acontece em build local. O registro do critério é gravado mesmo assim, a partir do cache do prebuild.

## Margem de arquivos

`verificar-dist-size` falha quando `MAX_FILES − arquivos do dist` fica abaixo de 150.

**Exceção de emergência:** a variável do repositório `PRERENDER_ACEITAR_MARGEM=<n>` (inteiro de 0 a 149) aceita margem real ≥ `n`. Valor fora disso faz o build falhar. Regras:

- uso **temporário**, só para destravar uma correção urgente; nunca escrita como valor fixo nos arquivos de workflow;
- o log do build registra a exceção e a margem observada; quem criar a variável abre, no mesmo dia, a tarefa de remoção com a causa;
- a variável é **apagada** no GitHub no primeiro build depois de resolvida a causa (remedir `ARQUIVOS_FIXOS`, regenerar a proteção ou voltar ao critério `v8`);
- como vale para o repositório inteiro, enquanto existir afeta produção e staging.

## Reversão

1. Criar ou alterar a variável do repositório `PRERENDER_PAROQUIAS_CRITERIO` com `demanda` (ou `qualidade`). Não precisa de commit.
2. **Hoje** a reversão também exige `PRERENDER_ACEITAR_MARGEM`: `demanda` e `qualidade` usam o teto fixo de 1.900, e com a base de 28/10/2026 (1.806 cidades) a margem fica em ~111 arquivos, abaixo da folga. Use o menor `n` que passe (ex.: `100`) e siga as regras da exceção.
3. Rodar um build: push em `dev` (staging) ou em `master` (produção). Os workflows não têm disparo manual.
4. Conferir no log: a linha `[prerender-paroquias] critério…`, o aviso de exceção do `dist-size` e `[criterio] seleção de paróquias igual no prebuild e no postbuild`.
5. Desfazer: apagar as duas variáveis quando o problema da V8 for corrigido.

## Arquivos de dados — regeneração conjunta

Os dois são gerados fora do build, **no mesmo ciclo**, com a mesma data final de Search Console e o sitemap publicado no mesmo dia:

1. `node scripts/atualizar-demanda-paroquias.mjs …` → `scripts/data/paroquias-demanda.json`
2. `node scripts/gerar-protecao-prerender.mjs --sitemap <xml> --sitemap-url <url> --sitemap-data <AAAA-MM-DD> --gsc-paroquias <csv> --gsc-cidades <csv> --janela <inicio>:<fim> --saida scripts/data/prerender-protecao.json`

O build loga as duas janelas e avisa quando uma terminou há mais de 45 dias ou quando as datas finais divergem mais de 14 dias. Chaves protegidas ou atuais que sumiram da base acima de 2% fazem o build falhar: regenere.
