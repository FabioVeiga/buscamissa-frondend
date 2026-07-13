---
name: revisao-api
description: Revisão de controllers/endpoints .NET do backend BuscaMissa — versionamento v1/v2, DTOs, validação, status codes, autorização, paginação, N+1 no EF e impacto no frontend. Use ao criar/alterar endpoint ou antes de PR do backend.
---

# Revisão de API — Backend .NET

Backend em `C:\Desenvolvimento\BuscaMissa\BuscaMissa` (Controllers/v1, Controllers/v2, DTOs, Services, Repositorios, Filters, Middlewares).

## Objetivo
Revisar endpoints quanto a contrato, segurança, performance EF e impacto no frontend, com achados em `arquivo:linha`.

## Quando usar
- Ao criar/alterar controller ou endpoint.
- Antes de abrir PR do backend.

## Entradas
- Controller/endpoint alvo, ou o diff da branch atual do backend.

## Saídas
1. Achados com `arquivo:linha`, severidade e sugestão.
2. Tabela **endpoint → serviço Angular consumidor** (grep em `src/app/core/services/` do front) com impacto de cada mudança.

## Processo
1. Consultar a skill `buscamissa-architecture` (Parte 2) para as convenções de camadas.
2. Checklist por endpoint:
   - [ ] **Contrato**: retorna DTO (`DTOs\`), nunca Model/entidade EF diretamente; usa o wrapper `ApiResponse<T>` padrão do projeto.
   - [ ] **Versionamento**: mudança que quebra contrato → novo endpoint em `Controllers\v2\`, nunca alterar v1 em uso (cruzar com skill `sync-contratos`).
   - [ ] **Validação de entrada**: ModelState/atributos; ids e filtros validados; nada de confiar em input do cliente.
   - [ ] **Status codes**: 200/201/204 corretos; 400 para input inválido; 404 para não encontrado; 401/403 coerentes.
   - [ ] **Autorização**: `[Authorize]`/roles corretos; endpoints admin não expostos anonimamente; endpoints públicos intencionais.
   - [ ] **Paginação**: listagens usam `PaginacaoDto`; nunca retornar tabela inteira sem limite.
   - [ ] **EF/performance**: `Include` consciente (N+1), `AsNoTracking()` em leitura, projeção para DTO no `Select` quando possível, queries por índice existente.
   - [ ] **Camadas**: Controller magro → Service → Repositório; regra de negócio não vive no controller.
   - [ ] **Filters/Middlewares**: aproveitar os existentes (`Filters\`, `Middlewares\`) em vez de duplicar tratamento de erro/log.
3. Impacto no front: para cada endpoint alterado, localizar o serviço consumidor em `C:\BuscaMissa\Frontend\buscamissa-frondend\src\app\core\services\` e listar se precisa de atualização (delegar detalhes à `sync-contratos`).

## Exemplos
- "Revisa o EngajamentoIgrejaController" → checklist completo + consumidores no front.
- "Revisa o diff da branch do backend antes do PR" → todos os endpoints tocados.

## Boas práticas
- Achado sem `arquivo:linha` não é achado.
- Não propor refactor grande fora do escopo do endpoint revisado — registrar como sugestão separada.
- Testar o endpoint em dev (Swagger/curl) quando o comportamento for ambíguo, em vez de supor.

## Aprendizados
Ao final da execução, se você identificar um padrão recorrente do projeto, uma convenção que deveria ser documentada ou uma melhoria que faria sentido virar uma nova Skill, registre a sugestão no final da resposta — mas **não altere documentação automaticamente**.
