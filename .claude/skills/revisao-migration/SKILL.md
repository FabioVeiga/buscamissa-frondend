---
name: revisao-migration
description: Revisão de migration EF Core (MySQL) do backend BuscaMissa antes de aplicar em dev/prod — perda de dados, defaults, índices, backfill, ordem de deploy. Use após `dotnet ef migrations add` e antes de qualquer `database update`.
---

# Revisão de Migration — EF Core + MySQL

## Objetivo
Dar um parecer **GO / NO-GO** sobre uma migration antes de aplicá-la, identificando risco de perda de dados, incompatibilidades MySQL e necessidade de backfill/rollback.

## Quando usar
- Após criar migration (`dotnet ef migrations add ...`) no backend `C:\Desenvolvimento\BuscaMissa\BuscaMissa`.
- Antes de `dotnet ef database update` em dev e, principalmente, em prod.

## Entradas
- Nome ou arquivo da migration em `Migrations\` (a mais recente, se não especificado).

## Saídas
1. **Parecer GO/NO-GO** com lista de riscos por severidade.
2. Revisão do SQL efetivo (gerar com `dotnet ef migrations script <anterior> <nova>` — revisar o SQL, não só o C#).
3. Quando necessário: script de backfill e/ou rollback, salvo em `Scripts\` (padrão do projeto: `fix_*.sql`, `fase1_*.sql`).

## Processo
1. Ler `Up()`/`Down()` da migration e o diff no `ApplicationDbContextModelSnapshot.cs`.
2. Checklist de risco:
   - [ ] **DropColumn/DropTable** → perda de dados? Existe backup/export antes?
   - [ ] **Rename** → EF/MySQL pode gerar drop+add dependendo do provider → perde dados. Verificar o SQL gerado.
   - [ ] Coluna nova **NOT NULL sem default** em tabela com dados → falha na aplicação. Exigir nullable ou `defaultValue`.
   - [ ] Mudança de tipo/tamanho (`varchar` menor, `int`→`enum`) → truncamento.
   - [ ] Índices/uniques novos → dados existentes violam? (rodar SELECT de verificação antes).
   - [ ] Collation/charset: manter utf8mb4 consistente.
   - [ ] ALTER em tabela grande (Igrejas, Missas, Métricas) → lock; avaliar janela de deploy.
   - [ ] `Down()` realmente reverte? (rollback viável).
3. **Backfill**: se a coluna nova precisa ser populada a partir de dados existentes, escrever o SQL de backfill versionado em `Scripts\` — nunca deixar "para depois".
4. **Ordem de deploy front/back**: se o front depende do campo novo, backend primeiro; se o backend remove campo que o front usa, front primeiro (cruzar com a skill `sync-contratos`).
5. Parecer final: GO (aplicar), GO com condições (backfill/janela), ou NO-GO (retrabalhar migration).

## Exemplos
- "Revisa a migration endereco_bairro_opcional" → verificar que tornar opcional não quebra validação no front/back.
- "Vou aplicar criar_metricas_diarias em prod" → checar índices, timezone (lição do `fix_timezone_metricas_diarias.sql`), volume.

## Boas práticas
- Nunca confiar só no C# da migration: o SQL gerado pelo provider MySQL (Pomelo) é a verdade.
- Toda correção manual em prod vira script versionado em `Scripts\` — nada de SQL avulso.
- Em prod, aplicar migration idealmente via script revisado (`ef migrations script --idempotent`), não `database update` cego.

## Aprendizados
Ao final da execução, se você identificar um padrão recorrente do projeto, uma convenção que deveria ser documentada ou uma melhoria que faria sentido virar uma nova Skill, registre a sugestão no final da resposta — mas **não altere documentação automaticamente**.
