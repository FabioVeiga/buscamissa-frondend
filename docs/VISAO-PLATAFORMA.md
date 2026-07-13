# BuscaMissa — Visão de Plataforma (horizonte 10 anos)

> **Premissa deste documento:** o BuscaMissa será a infraestrutura digital de celebrações da Igreja Católica no Brasil. Este documento desenha a plataforma-alvo — domínio, módulos, APIs, governança, permissões, ecossistema — e o caminho incremental para chegar lá **sem reescrever o sistema atual**.
>
> Status: referência estratégica. Não é um plano de sprint. Decisões de roadmap devem ser filtradas por ele ("isso nos aproxima ou nos afasta da visão?").

---

## 1. Tese e princípios

**Tese:** o ativo do BuscaMissa não é o site — é o registro canônico de celebrações católicas do Brasil, com proveniência, score de confiança e um pipeline que o mantém vivo (coletores + validação comunitária + gestão paroquial). O site é apenas o primeiro cliente desse registro.

**Princípios de produto:**

1. **Especificidade é força.** Não somos "o Google Maps da Igreja". Resolvemos um problema: *encontrar celebrações católicas confiáveis*. Toda feature se subordina a isso.
2. **Confiança acima de cobertura.** (Já é a regra R1–R5 dos coletores.) Um horário errado custa mais que um horário ausente. O score de confiança é o produto.
3. **Comunidade é o motor.** O efeito de rede é o fosso competitivo:
   `mais igrejas → mais usuários → mais confirmações → dados melhores → mais confiança → mais paróquias aderem → mais igrejas`. Toda decisão deve alimentar esse ciclo, nunca quebrá-lo.
4. **Gratuito primeiro, indispensável depois, monetizado por último.** Especialmente para dioceses: o dashboard nasce gratuito e útil; cobrança só quando for indispensável.
5. **Nada de rewrite.** A plataforma-alvo emerge por *strangler pattern* sobre o Angular + .NET + MySQL + coletores atuais. O sistema de hoje já é o "Core Registry v0".

---

## 2. O grafo de domínio

O modelo mental correto é um **grafo**, não uma tabela de igrejas. Três subgrafos conectados:

### 2.1 Subgrafo eclesial (a estrutura da Igreja)

```
CNBB
 └── Regional (Sul 1, Nordeste 2, ...)
      └── Província Eclesiástica
           └── (Arqui)Diocese
                └── Forania / Vicariato / Região Pastoral
                     └── Paróquia  ←── Pároco (celebrante)
                          └── Comunidade / Capela / Matriz   ←── Local (endereço + geo)
                               └── Celebração
                                    ├── Missa (recorrência semanal)
                                    ├── Confissão
                                    ├── Adoração
                                    ├── Novena / Terço
                                    └── EventoEspecial (festa do padroeiro, Cinzas, Tríduo, ...)
```

Entidades e observações de modelagem:

| Entidade | Existe hoje? | Nota |
|---|---|---|
| `TerritorioEclesial` (CNBB→Regional→Diocese→Forania) | ❌ (diocese só implícita na coleta) | Tabela hierárquica auto-referente (`parent_id`, `tipo`). É a chave do produto diocesano e das páginas `/dioceses/:slug`. |
| `Paroquia` vs `PontoDeCulto` (matriz/comunidade/capela) | ⚠️ parcial (pontos são registros separados sem vínculo) | Hoje Limeira tem 100 matrizes + 316 comunidades como registros irmãos. Falta a aresta `comunidade → paróquia-mãe`. É a aresta mais valiosa a criar: nenhuma base pública do Brasil tem esse grafo. |
| `Local` | ✅ (Address embutido) | Extrair como entidade quando houver eventos fora do templo (praças, santuários em festa). |
| `Celebracao` (tipo genérico) | ⚠️ só `Missa` semanal | Generalizar `Missa` para `Celebracao{tipo, recorrencia, observacao}`. Recorrência mensal ("1º sábado") hoje vive em texto livre no `Observacao` — vira `RegraRecorrencia` estruturada (RRULE simplificada). |
| `EventoEspecial` | ❌ | Horários de Natal/Cinzas/Padroeiro com vigência (`inicio`, `fim`). Sazonalidade é o maior pico de demanda do ano. |
| `Celebrante` | ⚠️ (`paroco` string) | Normalizar depois; baixa prioridade, mas no grafo desde já. |
| `Fonte` + `Proveniencia` | ✅ parcial (`fontePrincipal`, `ultimaValidacao`, `scoreConfianca`) | Evoluir para proveniência **por campo** (ver §5). |

### 2.2 Subgrafo social (as pessoas)

```
Usuário ── favorita ──→ PontoDeCulto
Usuário ── confirma ──→ Celebração  ("fui, o horário está certo")
Usuário ── corrige ───→ Celebração  (proposta de alteração)
Usuário ── busca ─────→ (Cidade, Bairro, Dia, Hora)   ← demanda, hoje só no Clarity
Usuário ── compartilha → Página
```

Cada aresta social é **sinal de confiança** e **sinal de demanda**. Hoje só favoritos existem estruturados; confirmações/correções são o próximo passo (QR na porta da igreja, botão "horário confirmado").

### 2.3 Subgrafo territorial/cultural

```
Cidade ── pertence ──→ Diocese (mapa civil ↔ eclesial)
Santuário ── destino ──→ Peregrinação/Romaria
Paróquia ── dedicada a ──→ Padroeiro (extraível do nome)
Cidade ── recebe ──→ Turismo religioso
```

Quando os três subgrafos se conectam, as funcionalidades "explodem" por combinação de arestas, não por código novo: *"missas de São José em cidades da diocese de Campinas no dia 19/03"* é uma consulta de grafo, não uma feature.

**Decisão de implementação:** grafo é o *modelo*, não a *tecnologia*. MySQL + EF Core dão conta por muitos anos (tabelas de nós + FKs como arestas). Não adotar graph DB até que uma consulta real justifique.

---

## 3. Arquitetura de módulos

Sete módulos lógicos. **Módulo ≠ microserviço**: começam como pastas/áreas no monolito .NET atual e só se separam se a escala exigir.

```
                 ┌─────────────────────────────────────────────┐
                 │              CORE REGISTRY                  │
                 │  grafo eclesial + celebrações + proveniência│
                 │  (fonte canônica — o ativo)                 │
                 └──────┬──────────────┬──────────────┬────────┘
        escreve         │              │              │ lê
 ┌──────────────┐  ┌────┴─────┐  ┌────┴──────┐  ┌────┴────────────┐
 │  INGESTÃO    │  │ GESTÃO   │  │ COMUNIDADE│  │  PUBLICAÇÃO     │
 │  coletores,  │  │ portal   │  │ favoritos,│  │  site, páginas  │
 │  import lote │  │ paróquia/│  │ confirma- │  │  SEO, widget,   │
 │              │  │ diocese  │  │ ções      │  │  API pública    │
 └──────────────┘  └──────────┘  └───────────┘  └─────────────────┘
        │                │              │              │
        └────────────────┴──────┬───────┴──────────────┘
                          ┌─────┴──────┐   ┌──────────────┐
                          │ CONFIANÇA  │   │ INTELIGÊNCIA │
                          │ scoring,   │   │ analytics,   │
                          │ conflitos, │   │ anuário,     │
                          │ moderação  │   │ demanda      │
                          └────────────┘   └──────────────┘
```

1. **Core Registry** — o grafo do §2 com histórico e proveniência. Hoje: as tabelas Church/Missa/Address. Evolui por migrations aditivas.
2. **Ingestão** — coletores Python + import em lote + (futuro) webhooks de sites paroquiais. Já é o módulo mais maduro do projeto. Regra: ingestão **nunca** sobrescreve dado de custódia superior (§5.2).
3. **Gestão** — portal da paróquia (secretária/pároco) e da diocese. Não existe hoje; é o coração do Horizonte 2.
4. **Comunidade** — favoritos (existe), confirmações, correções, avaliações de qualidade do dado (não do padre!). Alimenta Confiança.
5. **Confiança** — scoring por celebração e por campo, detecção de conflito entre fontes, fila de moderação. Hoje: score simples; evolui para máquina de reconciliação.
6. **Publicação** — site Angular, páginas programáticas de SEO, widget embutível, API pública, feeds (.ics, JSON-LD). O site atual é o primeiro cliente.
7. **Inteligência** — Clarity/GA + métricas próprias de busca (demanda não atendida), Anuário da Missa, dashboards.

---

## 4. APIs e SDKs

### 4.1 Camadas de API

| API | Consumidor | Auth | Conteúdo |
|---|---|---|---|
| **Public Read API v1** | apps católicos, sites de terceiros, mídia | API key gratuita + atribuição obrigatória | busca de pontos/celebrações, detalhes, territórios; rate limit generoso |
| **Widget/Embed API** | sites de paróquia (WordPress etc.) | chave por paróquia | HTML/JS auto-hospedado: `<script src="https://widget.buscamissa.com.br/p/{slug}.js">` |
| **Feeds** | Google, calendários | público | JSON-LD `schema.org/Event`, iCal (.ics) por ponto de culto, sitemaps |
| **Management API** | portal de gestão, futuros apps de secretaria | OAuth2 (usuário com papel) | CRUD de celebrações da própria paróquia, upload de foto, eventos especiais |
| **Bulk/Diocese API** | curias com sistema próprio | credencial institucional | import/export em lote, reconciliação, relatórios |
| **Webhooks** | terceiros | assinatura HMAC | `celebracao.atualizada`, `ponto.reivindicado`, `evento_especial.criado` |

### 4.2 SDKs (na ordem de valor)

1. **Widget JS** (o SDK que importa): um `<script>` que renderiza os horários da paróquia no site dela. É o cavalo de troia da adoção — a paróquia para de manter horário no site e o BuscaMissa vira a fonte. Sem build, sem npm, colável por qualquer secretária.
2. **Plugin WordPress** — a maioria dos sites paroquiais/diocesanos é WP (os coletores provam isso todo dia). Um plugin oficial "Horários BuscaMissa" alcança o ecossistema inteiro.
3. **Clientes TS e C# gerados do OpenAPI** — custo ~zero (gerar do Swagger existente), viabiliza terceiros.

**Regra de ouro:** tudo que o site próprio consome deve passar pela mesma Public API ("eat your own dog food"). Isso já força versionamento v1/v2 (que o backend já pratica) e garante que a API pública nunca fique cidadã de segunda classe.

---

## 5. Governança de dados

### 5.1 Proveniência por campo

Todo dado carrega origem. Evolução do modelo atual (`fontePrincipal` por missa) para proveniência por campo relevante:

```
Proveniencia {
  entidade, campo,
  fonte: coletor:brasilia | import:csv | paroquia:user_id | fiel:user_id | admin,
  timestamp, valor_anterior, evidencia (url/foto)
}
```

Isso dá: auditoria completa, rollback, e a base do score. O histórico de coletas vira série temporal ("esta paróquia mudou horário 3x este ano" = sinal de instabilidade).

### 5.2 Níveis de custódia (quem manda no dado)

```
nível 0  COLETADO      — veio de coletor/import; qualquer fonte pode atualizar
nível 1  VALIDADO      — confirmado por fiéis; coletor só atualiza com evidência melhor
nível 2  REIVINDICADO  — paróquia assumiu a gestão; coletor NUNCA sobrescreve,
                          apenas gera alerta de divergência para a paróquia
nível 3  DIOCESANO     — diocese homologou; divergências viram tickets no dashboard
```

O nível de custódia resolve o conflito central da plataforma (coletor × comunidade × paróquia) com uma regra simples: **custódia superior vence; custódia inferior vira sugestão**.

### 5.3 Score de confiança v2

Score por celebração composto de: idade da última validação, nível de custódia, nº de confirmações de fiéis, estabilidade histórica, qualidade da fonte. Exposto publicamente como selo ("verificado há 12 dias pela paróquia") — é o diferencial competitivo comunicado, não só interno.

### 5.4 LGPD e dados pessoais

- Dados de celebração são públicos por natureza; dados de **usuário** (favoritos, geolocalização, buscas) são pessoais: minimizar, anonimizar analytics, retenção definida.
- Nome do pároco é dado pessoal de figura pública no exercício da função — manter, mas com processo de remoção sob pedido.
- Confirmações de fiéis são armazenadas dissociadas da identidade quando exibidas ("12 pessoas confirmaram", nunca quem).

---

## 6. Modelo de permissões

Papéis (RBAC com escopo territorial — o papel sempre aponta para um nó do grafo eclesial):

| Papel | Escopo | Pode |
|---|---|---|
| **Visitante** | global | buscar, ver tudo público |
| **Fiel** (conta) | global | favoritar, confirmar horário, propor correção |
| **Colaborador** | cidade/diocese | correções com peso maior (reputação acumulada) |
| **Editor paroquial** (secretária) | 1..n paróquias | editar celebrações, fotos, contatos, eventos especiais |
| **Gestor paroquial** (pároco) | paróquia | tudo do editor + nomear editores + reivindicar comunidades |
| **Gestor diocesano** | diocese | dashboard, homologar paróquias, editar qualquer paróquia da diocese, bulk |
| **Moderador BuscaMissa** | global | fila de conflitos, banimentos, merges de duplicatas |
| **Admin** | global | tudo |

**Fluxo de reivindicação (claim)** — o momento crítico de segurança:

1. Pároco/secretária clica "Esta é minha paróquia" na página do ponto.
2. Verificação por um dos canais: e-mail no domínio da diocese/paróquia · telefone já cadastrado no registro · **carta física com QR/código enviada ao endereço da igreja** (o endereço nós temos e confiamos — é o canal anti-fraude mais barato) · homologação direta do gestor diocesano.
3. Claim aprovado ⇒ ponto sobe para custódia nível 2, aparece selo "gerido pela paróquia".

A diocese parceira é o atalho: um gestor diocesano homologado pode reivindicar as ~100 paróquias dele de uma vez.

---

## 7. Fluxo de atualização pelas paróquias

O fluxo que inverte a dinâmica (de "nós raspamos a Igreja" para "a Igreja publica através de nós"):

```
Secretária → portal BuscaMissa → salvar
    ⇒ Core Registry atualizado (custódia 2, proveniência registrada)
        ⇒ site BuscaMissa          (imediato)
        ⇒ widget no site paroquial (imediato)
        ⇒ JSON-LD / Google         (no próximo crawl)
        ⇒ .ics dos fiéis           (na próxima sincronização)
        ⇒ webhooks de terceiros    (imediato)
        ⇒ dashboard da diocese     (contador "atualizado hoje")
```

Um lugar, um salvar, todos os canais. Para paróquias **não** reivindicadas nada muda: coletores + validação comunitária seguem mantendo o dado (níveis 0–1). Os dois mundos convivem indefinidamente — é isso que permite crescer sem depender da adesão.

Conflito (coletor discorda da paróquia): nunca sobrescreve; gera notificação "seu site diz 19h, o BuscaMissa diz 19h30 — qual vale?". O conflito vira **engajamento**, não corrupção de dado.

---

## 8. Dashboards diocesanos

Posicionamento: **gestão pastoral, não analytics**. Gratuito até ser indispensável.

**v1 (gestão pastoral — o que gera valor no primeiro login):**
- Mapa da diocese com todas as paróquias/comunidades e status (com horário / sem horário / desatualizada / gerida).
- Lista de pendências: paróquias sem horário publicado em lugar nenhum (Osasco: 46 de 127 — nós já sabemos), dados vencidos há +180 dias, divergências site×BuscaMissa.
- Última atualização por paróquia e por quem.
- Confirmações de fiéis por paróquia (sinal de vitalidade do dado).

**v2 (planejamento):**
- Desertos de celebração: bairros/cidades da diocese sem missa em raio X.
- Demanda não atendida: o que os fiéis buscaram na região e não encontraram.
- Cobertura sacramental: confissões e adorações publicadas vs. paróquias.

**v3 (eventual monetização — só quando v1/v2 forem rotina da cúria):**
- Relatórios para assembleias/planos pastorais, exportações, integração com sistemas de cúria, comparativos anônimos entre dioceses.

---

## 9. Ecossistema para terceiros

Quem consome a Public API e por quê:

- **Apps de oração/liturgia** (estilo Hallow, iBreviary, apps de dioceses): "missas perto de você" dentro do app deles — com atribuição. Cada app parceiro é distribuição gratuita.
- **Mídia católica** (Vatican News Brasil, A12, Canção Nova, CNBB): dados do Anuário + widgets em matérias sazonais ("onde assistir missa de Cinzas na sua cidade").
- **Turismo religioso**: operadoras de romaria, sites de santuários — horários confiáveis de destinos de peregrinação.
- **Pastorais e movimentos**: localizar celebrações para eventos, encontros, retiros.
- **Pesquisa acadêmica** (sociologia da religião, geografia): dataset agregado sob licença — reforça a narrativa de infraestrutura e gera citações.

Regras do ecossistema: API key gratuita com atribuição visível obrigatória · sem revenda do dado bruto · rate limits por tier · ToS que preserva o BuscaMissa como fonte canônica. O objetivo do ecossistema não é receita — é tornar o registro **onipresente**, o que realimenta o ciclo de rede.

---

## 10. Roadmap incremental (sem rewrite)

Três horizontes. Cada item constrói sobre o código existente (Angular 19 + .NET/EF/MySQL + coletores Python). Nenhum item exige reescrever o anterior.

### Horizonte 1 — "Explorar o ativo que já existe" (0–6 meses)

O sistema atual já é o Core Registry v0. Colher o que está plantado:

| # | Entrega | Sobre o quê |
|---|---|---|
| H1.1 | Migrations aditivas: `TerritorioEclesial`, aresta `comunidade→paróquia`, `EventoEspecial` com vigência | backend, tabelas novas, zero breaking |
| H1.2 | SEO programático: `/missas/:uf/:cidade/:bairro`, páginas por dia ("missa domingo à noite em X"), `/dioceses/:slug` | rotas Angular novas + endpoints de listagem |
| H1.3 | Sazonalidade: páginas Cinzas/Natal/Semana Santa alimentadas por `EventoEspecial` | H1.1 + H1.2 |
| H1.4 | Botão .ics ("adicionar à agenda") e JSON-LD `Event` completo | página de detalhes existente |
| H1.5 | Confirmação de fiel ("horário correto?") + QR code por igreja apontando para a página com CTA de confirmação | módulo Comunidade v0; alimenta score |
| H1.6 | Extração LLM do campo `observacao` → confissões/adorações/missas mensais estruturadas | dado que já existe no banco |
| H1.7 | Métrica própria de demanda: logar buscas sem resultado (cidade/bairro/dia) | vira fila de priorização de coleta |

### Horizonte 2 — "Inverter a dinâmica" (6–18 meses)

| # | Entrega | Dependência |
|---|---|---|
| H2.1 | Custódia + proveniência por campo (modelo do §5) | H1.1 |
| H2.2 | Fluxo de claim (verificação por e-mail/telefone/carta-QR) | H2.1 |
| H2.3 | Portal da paróquia (editar celebrações, fotos, eventos especiais) — pode ser área autenticada no Angular atual | H2.2 |
| H2.4 | **Widget JS embutível + plugin WordPress** | Public API |
| H2.5 | Public Read API v1 com API keys + atribuição (formalizar a API que o site já consome) | backend atual + gateway de keys |
| H2.6 | Dashboard diocesano v1 (gestão pastoral, gratuito) com **1 diocese piloto** — candidatas: Limeira ou Osasco, onde a relação com o dado é profunda | H2.1, território H1.1 |
| H2.7 | **Anuário da Missa no Brasil v1** (relatório + assessoria de imprensa católica) | dado atual + H1.7 |

### Horizonte 3 — "Infraestrutura" (18 meses+)

| # | Entrega |
|---|---|
| H3.1 | Bulk/Diocese API + webhooks para sistemas de cúria |
| H3.2 | Programa de dioceses parceiras (claim em massa via gestor diocesano homologado) |
| H3.3 | Canal WhatsApp (busca conversacional + correção de horário por mensagem) |
| H3.4 | Ecossistema formal: portal de desenvolvedores, SDKs gerados, dataset de pesquisa |
| H3.5 | Grafo cultural: padroeiros, santuários, rotas de peregrinação (consultas combinando os 3 subgrafos) |
| H3.6 | Monetização diocesana (v3 do dashboard) — somente quando v1/v2 forem rotina |

### O que NÃO fazer (tão importante quanto)

- ❌ Graph DB, microserviços, filas — até que uma dor real exija. O monolito .NET + MySQL escala muito além do necessário.
- ❌ App nativo antes do canal WhatsApp provar/refutar a demanda mobile.
- ❌ Cobrar de dioceses no Horizonte 2.
- ❌ Rede social de fiéis, conteúdo devocional, transmissões — fora da tese ("celebrações confiáveis"). Parcerias resolvem isso via API.
- ❌ Expandir tipos de celebração antes de estruturar recorrência (H1.6 primeiro).

---

## 11. Riscos e decisões em aberto

| Risco | Mitigação |
|---|---|
| Diocese/CNBB lançar concorrente oficial | Ser útil antes de ser conhecido; o pipeline + histórico + comunidade não se copiam por decreto. Buscar parceria, não confronto — o dashboard gratuito É a proposta de parceria. |
| Claim fraudulento (alguém reivindica paróquia alheia) | Carta física com código + homologação diocesana como caminho preferencial (§6). |
| Coletores quebrarem em escala (100+ dioceses) | Adapters genéricos já provados (GeoDirectory, Cúria Online); monitoração de saúde por adapter; comunidade + paróquias reduzem dependência de coleta com o tempo. |
| Efeito de rede não engatar (paróquias não aderem) | O produto funciona sem adesão (níveis 0–1 de custódia). Adesão é aceleração, não pré-requisito. |
| Fadiga do fundador / equipe pequena | O roadmap H1 é inteiro de itens pequenos e independentes; nada exige big bang. |

**Decisões em aberto (registrar quando decididas):**
- Observabilidade: App Insights vs Sentry (plano da Etapa 6 já existe, aguardando decisão).
- Identidade de fiel: conta própria vs login social vs anônimo-com-device — impacta H1.5.
- Licença do dataset de pesquisa (H3.4).

---

*Documento criado em 2026-07-12 a partir da sessão de estratégia "CTO — oportunidades escondidas". Revisar a cada ~6 meses ou a cada mudança de horizonte.*
