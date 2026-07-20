# Plano — Notificações do Admin + Sessões de Atendimento/Confissão

Duas features novas, independentes entre si, ambas construídas sobre a base do **Responsável Verificado** (dono do plano: [plano-responsavel-verificado.md](plano-responsavel-verificado.md)).

## Progresso
- [x] Elaboração do plano e decisões de arquitetura (19/07/2026)
- [x] Feature A — Notificações (fases N1–N3) — PRs abertos, aguardando merge
- [x] Feature B — Sessões de Atendimento/Confissão (fases S1–S4) — PRs: api-admin #16, api-public #13, front (branch fase S3-4)

## Decisões fixadas
- **Notificações**: canal in-app apenas (painel `/meu-painel`), sem e-mail nesta primeira entrega.
- **Alcance do envio**: suporta lote — admin seleciona várias igrejas/dioceses de uma vez, não só uma.
- **Sessões (Secretaria/Confissão)**: input estruturado (dia da semana + horário início/fim), não texto livre — mesma filosofia de `Missas`, não um campo de texto solto.

---

## Feature A — Notificações do admin para responsáveis

### Por quê
Hoje o admin não tem como avisar um responsável verificado de nada (ex: "sua solicitação de X está pendente há muito tempo", "atualize o horário de Natal", aviso geral). Isso fecha um canal de comunicação admin→responsável que hoje só existe via e-mail avulso fora do sistema.

### Modelo de dados (api-admin, dono do schema)
```
Notificacao
  Id
  Titulo (string, curto)
  Mensagem (string, até ~1000 chars)
  CriadaPor (email do admin)
  CriadaEm (datetime)
  Tipo (enum: Geral=1, Aviso=2, Urgente=3) — só para estilo visual (cor/ícone)

NotificacaoDestino
  Id
  NotificacaoId (FK)
  IgrejaId (FK) — a notificação é sempre por igreja, não por usuário direto
  LidaEm (datetime?, null = não lida)
```
Por que `NotificacaoDestino` separado: uma notificação pode ir para N igrejas (envio em lote), e cada igreja tem seu próprio estado de leitura. Quem lê é "a igreja" (todo responsável aprovado daquela igreja vê a mesma notificação como lida quando qualquer um dela abrir — mais simples que rastrear leitura por usuário individual).

### Fluxo de envio (admin)
1. Tela nova no frontend-admin: `/notificacoes` (ou dentro de Igrejas).
2. Admin escreve título + mensagem, escolhe destinatários:
   - Seleção manual de igrejas (busca por nome/cidade), **e/ou**
   - Filtro em lote: "todas as igrejas com responsável verificado" / "todas de uma UF" / "todas de uma Diocese" (reaproveita `Diocese` da Fase 1).
3. Backend cria 1 `Notificacao` + N `NotificacaoDestino` (um por igreja resolvida do filtro).

### Fluxo de leitura (responsável)
1. `/meu-painel` mostra um badge/contador de notificações não lidas (para as igrejas do usuário).
2. Lista simples (título, mensagem, data), marcar como lida ao abrir.
3. Endpoint `GET /api/v1/responsavel/notificacoes` (api-public) — só notificações das igrejas onde o usuário `PodeEditarAsync`.

### Fora de escopo desta entrega
- E-mail (fica para uma fase 2 se o in-app não for suficiente).
- Notificação individual por usuário (é por igreja).
- Resposta do responsável ao admin (via notificação) — canal é só admin→responsável.

### Fases sugeridas
| Fase | Conteúdo |
|---|---|
| N1 ✅ | Schema `Notificacao`/`NotificacaoDestino` (api-admin) + endpoint de criação com resolução de filtro (igrejas manuais / UF) — PR aberto |
| N2 ✅ | Tela admin de envio (`/notificacoes`, envio por UF com preview obrigatório) — PR aberto. Seleção manual de igrejas fica de fast-follow |
| N3 ✅ | Endpoint de leitura (api-public) + badge/lista no `/meu-painel` — PRs abertos. **Feature A completa.** |

---

## Feature B — Sessões de Atendimento da Secretaria e Confissão

### Por quê
Hoje só existe `Missa` (dia + horário). Responsáveis querem informar também quando a secretaria atende e quando há confissão — informação estruturada, distinta de missa, que hoje não tem onde morar.

### Modelo de dados
Duas abordagens possíveis — recomendo a primeira:

**Opção recomendada: nova tabela `IgrejaSessao` genérica (não reaproveitar `Missas`)**
```
IgrejaSessao
  Id
  IgrejaId (FK)
  Tipo (enum: Secretaria=1, Confissao=2)
  DiaSemana (mesmo enum DiaDaSemanaEnum já usado em Missa)
  HorarioInicio (TimeSpan)
  HorarioFim (TimeSpan)
  Observacao (string?, opcional — ex: "ou por agendamento")
```
Por que não reaproveitar `Missa`: `Missa` tem campos específicos de missa (`FontePrincipal`, `UltimaValidacao`, confiabilidade) que não fazem sentido para secretaria/confissão, e semanticamente são conceitos diferentes (a UI de "Horários de Missa" da página não deveria listar confissão junto). Uma tabela nova e enxuta evita sobrecarregar `Missa` com campos condicionais.

`HorarioFim` é a única coisa que nem `Missa` tem hoje (ela só tem início) — introduzida aqui porque tanto secretaria quanto confissão são sempre um intervalo, não um horário pontual.

### Onde aparece
- Página pública da igreja: nova seção "Atendimento e Confissão" (ou dentro de "Informações da comunidade"), só aparece se houver ao menos 1 sessão cadastrada.
- Painel do responsável (`/meu-painel/editar/:igrejaId`): nova seção, mesmo padrão de FormArray já usado para `Missas` (dia + horário início/fim + observação, adicionar/remover linhas).
- **Cadastro colaborativo (fluxo sem responsável)**: fora de escopo nesta entrega — só responsável verificado edita, como as demais Fases 8/9. Colaborador anônimo não mexe nisso por enquanto.

### Fases sugeridas
| Fase | Conteúdo |
|---|---|
| S1 ✅ | Schema `IgrejaSessao` (api-admin, PR #16) + réplica no api-public (PR #13) |
| S2 ✅ | Backend: sessões no `GET/PUT /responsavel/igreja/{id}/dados` + na resposta pública dos detalhes da igreja (PR #13, empilhado no #12) |
| S3 ✅ | Frontend painel: seção "Atendimento e confissão" no `EditarIgrejaComponent` (FormArray tipo+dia+início/fim+observação) |
| S4 ✅ | Frontend público: seção "Atendimento e Confissão" nos detalhes da igreja (só renderiza se houver dados; agrupada por tipo) |

---

## Perguntas em aberto para quando formos implementar
- Notificações: precisa de expiração/arquivamento (ex: sumir da lista depois de X dias) ou fica permanente até marcar como lida?
- Sessões: o texto do `Observacao` deveria ter algum limite/validação além de tamanho (ex: proibir palavrão, igual `NoProfanityAttribute` já usado em outros campos)?
- Sessões: confissão às vezes é "antes de cada missa" em vez de horário fixo — vale um terceiro campo tipo boolean `VinculadaAMissa` ou isso fica de fora por ora (assumindo sempre horário fixo)?
