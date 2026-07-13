---
name: gerar-testes
description: Gera testes unitários Angular (Jasmine/Karma) para serviços de core/services e utils de shared/utils do BuscaMissa. Use ao criar/alterar serviço ou util, ou para subir cobertura de área crítica sem testes.
---

# Gerar Testes — Angular (Jasmine/Karma)

## Objetivo
Criar `*.spec.ts` de qualidade para lógica crítica do frontend, priorizando lógica pura e serviços — não componentes de UI complexos.

## Quando usar
- Ao criar/alterar serviço em `core/services/` ou util em `shared/utils/`.
- "Gera testes para os N arquivos mais críticos sem cobertura."

## Entradas
- Arquivo(s) alvo; ou pedir os mais críticos (prioridade: `mass-time.utils`, `distance.utils` — já têm spec, usar como referência de estilo —, `FavoritesService`, `SeoService`, `ChurchesService`, `GeolocationService`).

## Saídas
- `*.spec.ts` ao lado do arquivo testado, **rodando verde** em `ng test` (rodar antes de entregar: `ng test --watch=false --browsers=ChromeHeadless`).

## Processo
1. Ler o arquivo alvo e os specs existentes (`shared/utils/*.spec.ts`) para seguir o estilo do projeto.
2. Padrões por tipo:
   - **Utils puros**: describe/it direto, sem TestBed. Cobrir casos de borda (meia-noite, virada de dia da semana, distâncias zero/negativas).
   - **Serviços HTTP**: `TestBed` + `provideHttpClient(withInterceptorsFromDi())` + `provideHttpClientTesting()`; usar `HttpTestingController`, lembrar que URLs são relativas (interceptor prefixa base — testar a URL relativa).
   - **FavoritesService**: mockar `localStorage` (spy em getItem/setItem) e testar o Observable como single source of truth.
   - **Serviços com `window`/terceiros** (Analytics, Clarity): mockar o global, testar apenas que o wrapper chama certo.
3. Componentes standalone simples podem ser testados com `TestBed` importando o próprio componente; **não** investir em componentes de UI complexos (PrimeNG pesado, mapas Leaflet) — custo/benefício ruim por ora.
4. Rodar `ng test --watch=false` e corrigir até verde. Reportar cobertura do arquivo alvo.

## Exemplos
- "Testa o FavoritesService" → spec com localStorage mockado, add/remove/toggle, emissão do Observable.
- "Cobertura para mass-time" → ampliar o spec existente com casos de borda.

## Boas práticas
- Um comportamento por `it`; nomes descritivos em português (padrão do projeto).
- Testar contrato público, não implementação interna.
- Nunca deixar spec vermelho ou `xit` no commit.

## Aprendizados
Ao final da execução, se você identificar um padrão recorrente do projeto, uma convenção que deveria ser documentada ou uma melhoria que faria sentido virar uma nova Skill, registre a sugestão no final da resposta — mas **não altere documentação automaticamente**.
