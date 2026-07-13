---
name: seo-auditor
description: Auditoria de SEO do BuscaMissa — title/meta/OG/canonical via SeoService, JSON-LD, sitemap, deduplicação no GSC. Use antes de release, ao criar rota nova, ou ao investigar queda de indexação/tráfego no Google Search Console.
---

# SEO Auditor — BuscaMissa

## Objetivo
Auditar o SEO de uma rota específica ou do site inteiro e produzir um relatório acionável com severidade e fix sugerido. **Não aplica fixes automaticamente** — só com aprovação explícita.

## Quando usar
- Antes de merge para master / deploy.
- Ao criar uma rota nova (verificar se ela nasce com SEO completo).
- Ao investigar problema reportado pelo Google Search Console (páginas duplicadas, não indexadas, canonical alternativo).

## Entradas
- Rota(s) alvo (ex.: `/cidades`, `/igreja/:slug`) ou "site inteiro".
- Opcional: relato/print do GSC descrevendo o problema.

## Saídas
Relatório em tabela + prosa, cada achado com:
- **Severidade**: 🔴 crítico (impede indexação/duplica) / 🟡 importante / 🔵 menor.
- **Localização**: `arquivo:linha`.
- **Fix sugerido** (não aplicado).

## Processo
1. Consulte a skill `buscamissa-architecture` para o mapa de pastas se necessário.
2. **Fontes de verdade a inspecionar**:
   - `src/app/core/services/seo.service.ts` — centraliza title, meta OG/Twitter, canonical e JSON-LD. Toda página deve usar este serviço; meta tag setada fora dele é achado.
   - `src/app/app.routes.ts` — SEO estático por rota em `data`; rotas lazy via `loadComponent`.
   - `src/index.html` — **NÃO deve ter canonical nem og:url estáticos** (causou deduplicação no GSC — removido no commit 5adc3a6). Se reapareceram, é 🔴.
   - `scripts/gerar-sitemap.mjs` (roda no `prebuild:prod`) e `SitemapController`/`SeoController` no backend (`C:\Desenvolvimento\BuscaMissa\BuscaMissa\Controllers\v2\`).
3. **Checklist por página**:
   - [ ] Title único e descritivo (< 60 chars), meta description (< 160).
   - [ ] Canonical único, absoluto, apontando para a própria URL final (com slug).
   - [ ] OG/Twitter completos (title, description, image, url) e coerentes com canonical.
   - [ ] JSON-LD válido para o tipo: igreja → `Church` (+ endereço, geo, horários), listagem → `BreadcrumbList`/`ItemList`.
   - [ ] Rotas utilitárias (`cep-redirect` etc.) com `noindex`.
   - [ ] Slugs de cidade/igreja presentes no sitemap gerado; sem URLs órfãs nem 404 no sitemap.
4. **Verificação viva** (quando fizer sentido): `preview_start` com o dev server, navegar até a rota e usar `read_page`/`javascript_tool` para ler `document.title`, `link[rel=canonical]` e o script JSON-LD renderizados (o SEO é setado em runtime pelo SeoService — o HTML estático não conta).
5. Ordene os achados por severidade e apresente; pergunte antes de aplicar qualquer fix.

## Exemplos
- "Audita o SEO da página de cidade" → checklist completo em `modules/public/cidades` + rota + SeoService.
- "GSC diz que /igreja/x e /igreja/x/ estão duplicadas" → foco em canonical + trailing slash + `staticwebapp.config.json`.

## Boas práticas
- SEO deste projeto é runtime (SPA sem SSR): sempre valide o DOM renderizado, não só o código.
- Ao sugerir JSON-LD, valide a estrutura contra schema.org (tipos e propriedades obrigatórias).
- Não duplicar lógica: qualquer fix passa pelo `SeoService`, nunca por meta tags soltas em componente.

## Aprendizados
Ao final da execução, se você identificar um padrão recorrente do projeto, uma convenção que deveria ser documentada ou uma melhoria que faria sentido virar uma nova Skill, registre a sugestão no final da resposta — mas **não altere documentação automaticamente**.
