---
name: auditoria-pre-prod
description: Checklist de auditoria pré-produção do BuscaMissa — console, estados de erro, responsivo mobile, SEO básico, analytics (GA/Clarity/Métricas), acessibilidade e performance. Use antes de merge para master/deploy ou após feature grande.
---

# Auditoria Pré-Produção

## Objetivo
Rodar o ritual de auditoria do projeto sobre uma branch/feature e produzir relatório de achados numerados por categoria, no padrão já usado (C* = console/comportamento, I* = interface, SEO*). **Fixes só com aprovação.**

## Quando usar
- Antes de merge `dev` → `master` / deploy.
- Após feature grande ou redesign de página.

## Entradas
- Branch/feature a auditar; escopo (página específica ou site inteiro).

## Saídas
Relatório por categoria, cada achado com id (`C1`, `I3`, `SEO2`...), severidade (🔴/🟡/🔵), evidência (screenshot/log) e fix sugerido.

## Processo
1. Subir o app com `preview_start` (dev server Angular) — nunca via Bash.
2. **Console e rede** (`read_console_messages` + `read_network_requests`): zero erros no fluxo principal; requests 4xx/5xx; warnings de Angular.
3. **Estados de erro**: derrubar/simular falha de API e verificar que as páginas principais (home, city, details, buscar) mostram estado de erro com **"Tentar novamente"** (padrão do projeto — auditoria 5).
4. **Responsivo**: `resize_window` mobile (375×812) e tablet; verificar spacing, overflow horizontal, cards, navbar; depois desktop.
5. **SEO básico**: title/canonical/JSON-LD nas rotas alteradas (para auditoria profunda, invocar a skill `seo-auditor`).
6. **Telemetria (as 3)**: navegar e confirmar que disparam — Google Analytics (`AnalyticsService`), Clarity (`ClarityService`, projeto xctugfdm46) e métricas próprias (`MetricasService`, fire-and-forget com throttling) — via `read_network_requests`.
7. **Acessibilidade essencial**: contraste, `alt` em imagens, foco visível, labels em inputs, navegação por teclado no fluxo principal.
8. **Performance**: `ng build --configuration=production` — verificar budgets/bundle; conferir que rotas novas em `app.routes.ts` usam `loadComponent` (lazy); imagens com tamanho adequado.
9. Consolidar relatório, capturar screenshots como evidência, e perguntar quais achados corrigir.

## Exemplos
- "Audita a feature/NovaAuditoria antes do merge" → checklist completo nas páginas tocadas pela branch.
- "Auditoria rápida só da home mobile" → passos 2, 4 e 6 na home.

## Boas práticas
- Sempre auditar no build/config mais próximo de prod possível.
- Um achado = um id; ids nunca se repetem dentro do relatório (facilita referenciar em commits, padrão já usado: "fix C1/C3/I8...").
- Não corrigir nada durante a auditoria — primeiro o relatório completo, depois fixes aprovados.

## Aprendizados
Ao final da execução, se você identificar um padrão recorrente do projeto, uma convenção que deveria ser documentada ou uma melhoria que faria sentido virar uma nova Skill, registre a sugestão no final da resposta — mas **não altere documentação automaticamente**.
