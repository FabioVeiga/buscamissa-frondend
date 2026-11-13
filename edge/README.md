# edge — Worker de resolução de rotas HTML

Parte da publicação seletiva (plano: `C:\projetos\BuscaMissa\PLANO-PUBLICACAO-SELETIVA.md`, PR-1).
Esta pasta **não entra no build do site**: tem `package.json` próprio, fica fora do
`tsconfig` do Angular e é excluída da varredura do Tailwind por `@source not "../edge"`
em `src/styles.scss` (sem isso, o CSS publicado muda).

Nada aqui é implantado ainda. O deploy (wrangler, hostname de teste) é o PR-10.

## O que faz

Para `/paroquia/{uf}/{cidade}/{slug}` (e `/missas/{uf}/{cidade}`, quando `ROTAS` incluir `cidade`):

1. classifica o caminho (`src/rotas.mjs`): fora, inválido (404), não canônico (301) ou rota válida;
2. lê `ativo/{uf}/{cidade}.json` do Blob, passando pelo cache da borda (30 s);
3. decide (`src/resolver.mjs`) e executa (`src/borda.mjs`):

| Situação | Resposta |
|---|---|
| slug em `paroquias` | 200, HTML de `html/{uf}/{cidade}/{lote}/{slug}.html` |
| slug em `semPagina` | 200, shell CSR com `X-Robots-Tag: noindex` |
| slug em `redir` | 301 para o destino, preservando a query |
| slug ausente, ou cidade-lápide | 404 com a página de 404 (ver abaixo) |
| URL malformada (`%`, UF inexistente, segmentos a mais/menos) | 404 com a página de 404, sem tocar no Blob |
| maiúsculas ou barra final | 301 para a forma canônica |
| **sem manifesto, manifesto inválido, Blob fora, HTML referenciado ausente, método ≠ GET/HEAD** | **origem (SWA)**, com `x-bm-motivo` |

Princípio: **na dúvida, origem**. Enquanto a migração não termina, qualquer falha
devolve o comportamento de hoje. Cabeçalhos de rastreio: `x-bm-rota`,
`x-bm-execucao`, `x-bm-versao`, `x-bm-motivo`, `x-bm-404`.

### Cache-Control e página de 404

Valores medidos no SWA de produção em 13/11/2026 e repetidos aqui:

| Resposta | Cache-Control | Hoje no SWA |
|---|---|---|
| HTML (página e shell) | `public, must-revalidate, max-age=30` | igual |
| 404 | `public, must-revalidate, max-age=30` | igual |
| 301 | `public, max-age=3600` | sem Cache-Control (o navegador pode guardar indefinidamente) |

O 404 usa o corpo de `/404.html` da origem — a mesma página que o SWA serve pelo
`responseOverrides`, sem Angular e sem JavaScript —, **nunca o shell**. A resposta é
sempre `404` com `X-Robots-Tag: noindex`. Da origem são copiados só o
`Content-Type` e os cabeçalhos de segurança do `globalHeaders` (HSTS, nosniff,
X-Frame-Options, Referrer-Policy, Permissions-Policy, CSP). A página fica 5 min no
cache da borda (`/__bm/origem/404.html`); falhas da origem não são guardadas. Se a
origem estiver fora, responder erro ou não tiver o arquivo, o Worker usa uma página
mínima embutida, ainda `404` + `noindex` + `nosniff`, e marca `x-bm-404: embutida`.

## Contrato do manifesto

Fonte executável: `src/manifesto.mjs` (sem dependências, roda no Worker e no Node;
o publicador do PR-6 importa daqui). `schema/manifesto.schema.json` descreve a
mesma forma e um teste garante que os dois concordam. Regras entre campos (slug em
uma só lista, lápide vazia, `redir` para si mesmo, `semPagina` exige `shell`) só
existem no módulo.

O manifesto guarda **o lote** de cada página, não o caminho do arquivo. O caminho
é montado pelo Worker a partir de uf, cidade e slug já validados, então um
manifesto não consegue apontar para arquivo de outra cidade. Rollback é um
manifesto que aponta para lotes anteriores.

## Cache e purga

O Worker guarda manifesto (30 s), ausência de manifesto (30 s) e HTML versionado
(1 ano, imutável) na Cache API, com chave sob o próprio hostname:
`https://{host}/__bm/blob/{caminho}` (`chaveCacheBlob` em `src/borda.mjs`). Assim a
purga por URL da zona alcança o manifesto; a purga é aceleração, o TTL garante a
convergência. Erros do Blob não são guardados.

O que só pode ser confirmado na Cloudflare (PR-10): a purga por URL remover
entradas da Cache API, a Cache API não funcionar em `*.workers.dev` (precisa de
hostname em zona) e se uma requisição pública a `/__bm/...` pode receber essas
entradas (o conteúdo é público de qualquer forma; a SAS nunca entra na chave).

## Comandos

```bash
cd edge
npm install
npm test        # node:test; inclui o Worker rodando no workerd via Miniflare, Blob e origem simulados
npm run bench   # custo de CPU no manifesto do tamanho de São Paulo
```

Medição local (Node 24, este PC), manifesto de 509 igrejas / 30 KB:
parse + validação ~0,35 ms (p50) / ~1,5 ms (p99); com o isolate quente o
manifesto já validado é reaproveitado e a requisição custa ~3 µs. A medição que
vale para o limite de CPU é a do PR-10.

## Variáveis (wrangler, PR-10)

| Nome | Tipo | Uso |
|---|---|---|
| `BLOB_BASE` | var | `https://{conta}.blob.core.windows.net/{conteiner}`, sem barra final |
| `BLOB_SAS` | secret | SAS só de leitura, sem `?` |
| `ORIGEM` | var, opcional | origem do fallback no hostname de teste; sem ela, `fetch(request)` |
| `ROTAS` | var | `paroquia` (padrão) ou `paroquia,cidade` |

## Decisões e pendências

- 301 com 1 h de cache: um redirecionamento desfeito (igreja restaurada) pode
  ficar até 1 h no navegador — hoje, sem Cache-Control, pode ficar indefinidamente.
- URL malformada sob `/paroquia/` vira 404, e maiúsculas/barra final viram 301,
  mesmo em cidade sem manifesto. Hoje o SWA entrega o shell em 200. As 3.898 URLs do
  sitemap de produção de 13/11 passam no classificador sem nenhum 404 ou 301.
- As 40 regras de 404 do `staticwebapp.config.json` só valem quando o Worker cai
  na origem. Hoje nenhuma dessas igrejas existe (API de produção responde 404 para
  todas); se uma voltar e for publicada, o Worker serve 200. O validador do
  publicador (PR-6) deve reprovar manifesto com esses slugs.
- Os cabeçalhos de segurança do SWA são copiados só no 404. HTML 200 e 301 servidos
  pelo Worker ainda não os trazem — a decidir antes do PR-10.
