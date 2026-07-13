---
name: data-quality
description: Auditoria de qualidade do banco do BuscaMissa — duplicidades, coordenadas erradas, slugs, horários impossíveis, contatos inválidos, cobertura por cidade/UF e scorecard geral da base. Use periodicamente, pós-import de diocese, pré-release ou sob demanda ("auditar a base de MG").
---

# Data Quality — auditoria da base

O ativo mais valioso do BuscaMissa é a **qualidade do banco de dados**. Esta skill audita a base (MySQL, via backend em `C:\Desenvolvimento\BuscaMissa\BuscaMissa`) e produz um scorecard comparável entre execuções.

## Objetivo
Detectar e quantificar problemas de dados, medir cobertura e gerar um score geral que sirva de métrica de evolução mensal. **Nunca aplica correção em prod sem aprovação.**

## Quando usar
- Após import de uma diocese (validar o que entrou).
- Pré-release / periodicamente (acompanhar o score).
- Sob demanda: "auditar a base de MG", "tem igreja duplicada em Goiânia?".

## Entradas
- Escopo: base inteira, UF, cidade ou diocese recém-importada.
- Ambiente: dev ou prod (padrão dev; prod exige cautela redobrada).

## Saídas
1. **Scorecard** (abre o relatório):

```
Qualidade Geral: XX/100
├─ Cobertura (pontos com horário / total): XX%
├─ Geocoding: XX%
├─ Não-duplicidade: XX%
├─ Horários válidos: XX%
├─ Fotos: XX%
├─ Endereço completo: XX%
├─ Redes sociais/contato válidos: XX%
└─ Confiança (score de confiabilidade): XX%
```

**Fórmula (fixa, para comparabilidade):** Qualidade Geral = média ponderada — Cobertura 25%, Geocoding 15%, Não-duplicidade 15%, Horários válidos 15%, Endereço 10%, Fotos 10%, Contato/redes 5%, Confiança 5%. Cada subscore = % de registros do escopo que passam na checagem.

2. Relatório por categoria: contagem + amostra (Id, nome, cidade, problema).
3. SQL de diagnóstico reutilizável de cada checagem.
4. Quando solicitado: scripts de correção versionados em `Scripts\` do backend (padrão `fix_*.sql`).

## Checagens

**Duplicidade**
- Igrejas: nome normalizado (sem acento/caixa/"Paróquia|Igreja|Capela") + mesma cidade; mesmo `GooglePlaceId`; mesmo endereço+número.
- Missas: mesma igreja + dia + horário repetidos.
- Bairros duplicados por variação de grafia.

**Geo**
- Lat/long nulas (sem geocoding).
- Lat/long **invertidas** (lat fora de [-34, 6] ou long fora de [-74, -34] para o Brasil).
- Coordenada fora do bounding box da cidade/UF declarada (distância ao centroide da cidade > ~50km = suspeito).

**Consistência**
- Cidade/UF incoerentes com o CEP; slug de cidade/igreja fora do padrão ou duplicado.
- CEP inválido (regex `^\d{5}-?\d{3}$` + existência via ViaCEP em amostra).
- Telefone BR inválido; links http quebrados; URLs de redes sociais malformadas.

**Horários** (regra R5 dos coletores)
- Horário impossível (madrugada sem ser vigília), minuto fora de padrão (ex.: 07:13), dia da semana inválido, missa duplicada.
- Lembrar: recorrência **mensal não existe no schema** — se detectada codificada errado como semanal, é achado 🔴.

**Completude**
- Igreja sem foto, sem endereço, sem bairro (opcional desde migration), sem nenhuma missa cadastrada.
- Score de confiança baixo (`StatusConfianca`).

**Cobertura**
- Por cidade e por UF: pontos "prontos" (com horário) / total — formato já usado no projeto ("626 prontas/1108").

## Processo
1. Definir escopo e ambiente; obter acesso aos dados (endpoint admin, export CSV, ou SQL direto conforme disponível na sessão).
2. Rodar as checagens; montar scorecard + relatório.
3. Propor correções agrupadas; para prod, gerar `fix_*.sql` versionado e **aguardar aprovação**.
4. ⚠️ Correção de base já limpa manualmente é sempre por **Id** — nunca por reimport (lição Santos).
5. Registrar o score na memória para comparação com a próxima execução.

## Exemplos
- "Roda o data-quality na base de MG" → escopo UF=MG, scorecard + achados (base MG foi limpa em jul/2026 — comparar).
- "Acabei de importar Presidente Prudente, valida" → escopo diocese, foco em dup/geo/horários.

## Boas práticas
- Mesma fórmula sempre — se precisar mudar pesos, versionar a mudança nesta skill e recalcular o histórico.
- Amostras no relatório: no máx. 10 por categoria, com Ids (acionáveis).
- Diagnóstico em SELECT primeiro; UPDATE/DELETE só em script revisado e aprovado.

## Aprendizados
Ao final da execução, se você identificar um padrão recorrente do projeto, uma convenção que deveria ser documentada ou uma melhoria que faria sentido virar uma nova Skill, registre a sugestão no final da resposta — mas **não altere documentação automaticamente**.
