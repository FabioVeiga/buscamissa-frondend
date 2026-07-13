---
name: coletor-diocese
description: Pipeline completo de coleta de uma diocese — recon do site, escolha/reuso de adapter, regras de qualidade R1–R5, geocodificação, dedup, CSV de import em lote e import dev→auditoria→prod. Use para "coletar diocese X", "fazer adapter para Y" ou auditar uma coleta existente.
---

# Coletor de Diocese — pipeline de coleta → import

Coletores vivem em `C:\BuscaMissa\coletor-guarulhos\` (nome histórico; contém todos os adapters). CSVs finais/histórico em `_arquivo\`.

## Objetivo
Guiar a criação (ou reuso) de um adapter de coleta para uma diocese e conduzir o pipeline até o import, garantindo qualidade sobre cobertura.

## Quando usar
- "Coletar a diocese de X" / "fazer adapter para Y".
- Auditar/retomar uma coleta existente (consultar memórias `*-estado.md` antes — várias dioceses já têm estado salvo).

## Entradas
- Nome da diocese + URL do site oficial; opcionalmente adapter de referência.

## Saídas
1. Adapter (`adapter_<diocese>.py`) — ou adapter genérico parametrizado.
2. CSV validado no formato de import em lote.
3. Relatório de qualidade: nº pontos / nº missas / % com horário / % geocodificado / % com foto.
4. Plano de import (dev → auditoria → prod).

## Processo

### 1. Recon do site (antes de escrever qualquer código)
Identificar o CMS/estrutura:
- **WordPress + plugin GeoDirectory** (classes `geodir-field-*`) → usar `adapter_geodirectory.py` (genérico; validado em Brasília; reusável p/ Maringá/Aparecida/Florianópolis/Vitória).
- **"Cúria Online do Brasil"** → usar `adapter_curiaonline.py` (genérico; validado em Maringá).
- **WP + Elementor/JetEngine estático** → modelar sobre `adapter_recife.py` quando há página central de horários.
- Página de listagem JSON estruturado → ver `adapter_curitiba.py` (data-item + BFS).
- Horários só em **imagens/cartazes** → coleta via playwright + visão (ver Araçatuba) + mecanismo de **OVERRIDES** (ver Lorena).

### 2. Regra de reuso (obrigatória)
**Antes de criar um adapter novo, verifique se algum existente cobre ≥80% do comportamento necessário. Prefira estender/parametrizar um adapter existente a criar um quase igual.** A explosão de adapters duplicados é o principal risco de manutenção do coletor.

### 3. Regras de qualidade R1–R5 (confiabilidade > cobertura)
- **R1** — Não inventar: nunca preencher dado que não está na fonte.
- **R2** — Só missa: não coletar confissão, adoração, terço, expediente de secretaria.
- **R3** — Volume: validar contagens contra a fonte (nº de paróquias esperado da diocese).
- **R4** — Amostragem: conferir manualmente uma amostra de registros contra o site.
- **R5** — Plausibilidade: horários possíveis (sem missa 3h da manhã salvo vigília, domingo com missas, durações plausíveis).
Rodar `qualidade.py` / `validar_qualidade.py` sobre o CSV.

### 4. Formato do CSV de import em lote
- Colunas conforme o import CSV→endpoint (ver scripts em `coletor-guarulhos\`): atenção a **Obs (igreja) vs ObsMissa (missa)**.
- **Comunidades/capelas = pontos separados** da matriz (nunca agregadas).
- **Recorrência mensal não existe no schema** (só semanal) → vai descrita no campo `Observacao`.
- Dedup por nome normalizado + endereço; fallback de endereço via ViaCEP.
- Geocodificar tudo; marcar coordenadas aproximadas para refino.

### 5. Import e pós-import
1. Importar em **dev** primeiro; auditar (contagens, amostra, mapa).
2. Corrigir por SQL versionado quando necessário (padrão Lorena/Guaxupé).
3. Importar em prod só após auditoria; atualizar a memória `<diocese>-estado.md`.
4. ⚠️ **Nunca reimportar por cima de base já limpa manualmente** (lição Santos: reimport perde comunidades e correções por Id).

## Exemplos
- "Coleta a diocese de Campo Grande" → recon já feito (memória `recon-es-mt-ms.md`): WP+Elementor com página central de horários → modelar sobre adapter_recife.
- "Audita a coleta de Taubaté antes de importar" → validar CSV existente contra R1–R5 + geocodificar os 4 sem endereço.

## Boas práticas
- Consultar `backlog-coletores-dioceses.md` e `expansao-nacional-ordem.md` (memória) para prioridade — foco em dioceses "baratas".
- Scripts exploratórios com prefixo `_` (convenção da pasta); adapter final limpo e sem debug.
- Registrar estado final em memória (`<diocese>-estado.md`) com contagens e pendências.

## Aprendizados
Ao final da execução, se você identificar um padrão recorrente do projeto, uma convenção que deveria ser documentada ou uma melhoria que faria sentido virar uma nova Skill, registre a sugestão no final da resposta — mas **não altere documentação automaticamente**.
