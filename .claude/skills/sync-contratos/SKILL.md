---
name: sync-contratos
description: Sincroniza contratos front↔back — gera/atualiza interfaces TS em core/interfaces a partir de DTOs C# do backend, detecta divergências e classifica breaking changes. Use sempre que um DTO ou endpoint do backend for criado/alterado, ou para verificar se front e back estão em dia.
---

# Sync Contratos — DTOs C# ↔ Interfaces TS

## Objetivo
Manter `core/interfaces/` (frontend) como espelho fiel dos DTOs do backend, gerando/atualizando interfaces TS e **classificando o impacto de cada mudança (backward compatible vs breaking change)**.

## Quando usar
- Backend criou/alterou DTO em `C:\Desenvolvimento\BuscaMissa\BuscaMissa\DTOs\` ou endpoint em `Controllers\v1|v2\`.
- Verificação periódica de divergência ("o front está em dia com a API?").

## Entradas
- Caminho do DTO C# ou nome do endpoint/controller; OU escopo de verificação ("todos os DTOs de Igreja").
- Sentido: gerar TS a partir do C# (padrão) ou apenas diagnosticar divergências.

## Saídas
1. Interface criada/atualizada em `src/app/core/interfaces/` (fonte única — nunca duplicar; hoje: `church.interface.ts`, `user.interface.ts`, `solicitacao.interface.ts`).
2. Diff de divergências (campos faltantes, nullability, enums, tipos).
3. **Bloco de compatibilidade obrigatório**:

```
Compatibilidade: ✅ backward compatible | ⚠️ BREAKING CHANGE
Motivo: <ex.: campo `bairro` passou de opcional para obrigatório>
Arquivos afetados: <serviços em core/services/ e componentes que consomem>
Estratégia de migração: <ex.: versionar endpoint em v2; tornar campo opcional no TS até deploy coordenado>
```

## Processo
1. Ler o DTO C# (atenção a `[JsonPropertyName]`, herança, `ApiResponse<T>` wrapper e `PaginacaoDto`).
2. Mapear tipos:
   | C# | TS |
   |---|---|
   | `int`, `long`, `decimal`, `double` | `number` |
   | `string` | `string` |
   | `bool` | `boolean` |
   | `DateTime`/`DateOnly`/`TimeSpan` | `string` (ISO/`HH:mm:ss` — como o JSON serializa) |
   | `T?` / nullable | `campo?: tipo` ou `tipo \| null` (seguir padrão do arquivo) |
   | `enum` C# | enum/union TS existente em `core/interfaces/` — reutilizar, não recriar |
   | `List<T>` | `T[]` |
3. Nomes: o backend serializa em **camelCase** — a interface TS usa camelCase.
4. Localizar a interface existente e **editar** (nunca criar arquivo paralelo). Se for domínio novo, criar `<dominio>.interface.ts` em `core/interfaces/`.
5. **Classificar cada diferença**:
   - ⚠️ breaking: campo removido/renomeado; nullable→obrigatório; tipo alterado; enum com valor removido.
   - ✅ compatível: campo novo opcional; enum com valor novo (mas avisar switches exaustivos no front); campo obrigatório→opcional.
6. Rastrear consumidores: `Grep` pelo nome da interface/campo em `core/services/` e `modules/` para listar arquivos afetados.
7. Atualizar o serviço consumidor em `core/services/` se a assinatura do endpoint mudou (lembrar: URLs relativas — `ApiBaseUrlInterceptor` prefixa a base; serviços nunca montam URL completa).

## Exemplos
- "O backend adicionou `GooglePlaceId` na IgrejaDto" → adicionar `googlePlaceId?: string` em `Church`, bloco ✅ compatível.
- "Renomeamos Denuncia para ReportarProblema" → ⚠️ breaking; listar todos os usos, propor migração coordenada ou v2.

## Boas práticas
- Sempre confira o JSON real (Swagger/response de dev) quando houver dúvida de serialização — o contrato é o JSON, não o C#.
- Tipos só de UI ficam em `shared/models/`, não em `core/interfaces/`.
- Nunca marque um campo como obrigatório no TS se o banco pode ter registro antigo nulo.

## Aprendizados
Ao final da execução, se você identificar um padrão recorrente do projeto, uma convenção que deveria ser documentada ou uma melhoria que faria sentido virar uma nova Skill, registre a sugestão no final da resposta — mas **não altere documentação automaticamente**.
