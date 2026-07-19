# Plano — Feature "Responsável Verificado"

Contexto e decisões de arquitetura completas na conversa original (PO/techlead). Este arquivo é o checklist de execução — marcar `[x]` conforme os itens forem concluídos.

> 📖 **Como o fluxo funciona** (documentação funcional/técnica, com diagramas): [fluxo-responsavel-verificado.md](fluxo-responsavel-verificado.md)

## Decisões fixadas
- Nome de trabalho: **Responsável Verificado** (badge "Verificado ✓").
- Auth: JWT completo com senha (não magic link) — feature nova no api-public.
- Conflito de permissão paróquia x capela: **responsável local sempre vence** (se a capela tem responsável próprio aprovado, só ele edita; senão herda da paróquia-pai).
- Serviço: o fluxo entra no **api-public** por enquanto (domínio de `Igreja` já mora lá), isolado como módulo próprio para poder ser extraído depois. Um serviço dedicado (`api-owner`/`api-paroquia`) só se justifica quando monetização/mini-site por paróquia saírem do papel — não construir isso agora.

## Fluxo de execução (regra para TODAS as fases)

1. Criar uma branch de feature própria por fase, a partir de `dev` (nomenclatura: `feature/responsavel-verificado-faseN-<descricao>`).
2. Rodar e testar **tudo localmente** antes de qualquer PR — incluindo migration de banco local (não aplicar direto em `dev` compartilhado).
   - **Importante:** o ambiente `dev` tem outras iniciativas em andamento em paralelo — migrations e mudanças de schema desta feature **não podem ser aplicadas em `dev` sem teste local completo antes**, para não misturar/quebrar trabalho paralelo.
   - Testar migration: `dotnet ef database update` local, validar rollback (`dotnet ef migrations remove` se necessário antes de commitar), revisar com skill `revisao-migration`.
   - Testar fluxo ponta a ponta local (front local + api local) antes de subir.
3. Só depois do teste local completo, abrir PR para `dev` e mesclar a fase.
4. Cada fase é mesclada e validada em `dev` isoladamente antes de iniciar a branch da fase seguinte (evita empilhar risco de schema).

---

## Fase 0 — Preparação
- [ ] Confirmar nome final da feature na UI ("Responsável Verificado" + badge)
- [ ] Decidir prazo/prioridade da Fase 3 (auth JWT) vs. resto — é o maior bloco

## Fase 1 — Admin: Arquidiocese/Diocese
Branch: `feature/responsavel-verificado-fase1-diocese`

- [x] `Models/Arquidiocese.cs` + `Models/Diocese.cs` (api-admin)
- [x] Migration EF `AddArquidioceseDiocese` (revisada com skill `revisao-migration` — parecer GO)
- [x] Testar migration localmente (up/down) — validada no banco de teste `u466508834_bmrespteste`
- [x] `Controllers/DioceseController.cs` único (`[Authorize(Roles="Admin")]`, rotas `api/v1/admin/arquidioceses` + `api/v1/admin/dioceses`) + `DioceseService` + `DioceseDtos` — CRUD testado ponta a ponta local (10 cenários: criar, duplicata 409, FK inválida 409, soft-delete, filtros, 404)
- [x] Tela admin: listar/criar/editar/inativar Arquidiocese (página única `Dioceses.jsx` com abas)
- [x] Tela admin: listar/criar/editar/inativar Diocese (vínculo opcional à arquidiocese, toggle "Mostrar inativas")
- [x] Teste local completo (front admin + api-admin local + banco de teste remoto) — login, criar diocese via UI, editar/reativar, filtros, console limpo
- [x] PR para `dev` e merge — [api-admin #11](https://github.com/buscamissa/buscamissa-api-admin/pull/11) ✅ mesclado (18/07), [frontend-admin #102](https://github.com/FabioVeiga/buscamissa-frondend-admin/pull/102) ✅, migration aplicada em dev

## Fase 2 — Schema de hierarquia de Igreja
Branch: `feature/responsavel-verificado-fase2-hierarquia`

- [x] Enum `TipoIgrejaEnum` (`Paroquia=1|Capela|Comunidade|Santuario|Outro=99`)
- [x] Campo `Igreja.TipoIgreja` (backfill `DEFAULT 1` = Paroquia p/ dados existentes)
- [x] Campo `Igreja.IgrejaPaiId` (FK self-reference, nullable, Restrict)
- [x] Constraint `CK_Igrejas_ParoquiaSemPai` (CHECK no banco: paróquia nunca tem pai; "capela deve ter pai" fica na camada de serviço)
- [x] Migration `AddIgrejaHierarquia` (revisada — parecer GO; SQL aditivo, ADD COLUMN instant)
- [x] Testar migration no banco de teste — up/down, CHECK bloqueando insert inválido (MariaDB erro 4025), FK Restrict bloqueando delete de paróquia com filha
- [x] Front: `tipoIgreja`/`igrejaPaiId` em `Church`/`ChurchApiData` + enum `TipoIgreja` espelhado (tsc limpo)
- [x] Teste local completo (schema validado com inserts reais no banco de teste)
- [x] PR para `dev` e merge — [api-admin #12](https://github.com/buscamissa/buscamissa-api-admin/pull/12) ✅ e [front público #89](https://github.com/FabioVeiga/buscamissa-frondend/pull/89) ✅ mesclados (18/07); migration aplicada em dev pela pipe do CI (confirmado: 2505 igrejas backfilladas como Paroquia)

## Fase 3 — Auth de usuário público (JWT + senha)
Branch: `feature/responsavel-verificado-fase3-auth`

- [x] Schema: `Usuarios.SenhaDefinidaEm` + `CodigoSenha`/`CodigoSenhaExpira` + tabela `RefreshTokens` — migration no **api-admin** (dono do schema), coluna `Senha`+BCrypt já existiam do monólito
- [x] Testar migration no banco de teste (up/down validados)
- [x] Fluxo de cadastro de senha: `POST /auth/solicitar-codigo-senha` (código 6 dígitos por e-mail, 15min, serve p/ cadastro E esqueci-senha) + `POST /auth/definir-senha`
- [x] `AuthController`: `POST /auth/login` (mensagens neutras, exige senha definida)
- [x] `AuthController`: `POST /auth/refresh` (rotação; reuso de token antigo → 401; trocar senha revoga sessões)
- [x] Esqueci-senha coberto pelo mesmo fluxo de solicitar-codigo/definir-senha
- [x] JWT com claims de `PerfilEnum` (email + role, chave/issuer idênticos ao monólito) + rate limiting 5 req/min por IP nos endpoints de auth
- [x] Front: tela `/entrar` (3 modos: login, solicitar código, definir senha) + `AuthService` (sessão localStorage + Observable, restauração no boot)
- [x] Front: `AuthInterceptor` — token de sessão do usuário tem prioridade, chamadas anônimas seguem com o token estático
- [x] Teste local completo — login pela UI, sessão persistida, redirect de logado em /entrar (bug de FormGroup encontrado e corrigido), console limpo
- [x] PR para `dev` e merge — [api-admin #13](https://github.com/buscamissa/buscamissa-api-admin/pull/13) ✅, [api-public #6](https://github.com/buscamissa/buscamissa-api-public/pull/6) ✅, [front #90](https://github.com/FabioVeiga/buscamissa-frondend/pull/90) ✅ (18/07); migration aplicada em dev pela pipe, endpoint /auth/login respondendo em dev

## Fase 4 — `IgrejaResponsavel` + regras de herança
Branch: `feature/responsavel-verificado-fase4-responsavel`

- [x] `Models/IgrejaResponsavel.cs` (Papel Titular/Delegado, Status Pendente/Aprovado/Revogado/Rejeitado, MetodoVerificacao, cargo/observação, RevisadoPor/MotivoRevisao — histórico sem DELETE)
- [x] Migration `AddIgrejaResponsavel` (aditiva, índices IgrejaId+Status e UsuarioId)
- [x] Testada no banco de teste
- [x] `ResponsavelService` (api-public): regra "responsável local vence" + herança paróquia→capela + `minhas-igrejas` com flag `porHeranca`
- [x] `POST /api/v1/responsavel/igreja/{id}/solicitar` (+ `minhas-igrejas`, `pode-editar`) — [Authorize Regular,Dono]
- [x] `GET /admin/responsaveis` (filtro por status) + `/pendentes`
- [ ] Tela admin: listar usuários `Regular`/`Dono` + fila de aprovação (fica com a tela da Fase 7 — moderação)
- [x] `POST /admin/responsaveis/{id}/aprovar` (promove Perfil→Dono) + `/{id}/rejeitar`
- [x] `POST /admin/responsaveis/{id}/revogar` (rebaixa p/ Regular se era o último vínculo)
- [x] E-mail de aprovação (enviado via SendGrid no teste — template novo)
- [x] E-mail de revogação e rejeição (com motivo)
- [x] Teste local completo — 17 cenários: solicitar (409 duplicado, 401 sem token), aprovar (409 repetido), pode-editar antes/depois, herança nas 2 filhas, **local vence** (user2 na capela bloqueia herança do user1 só naquela capela), revogação restaura herança e rebaixa perfil
- [x] PR para `dev` e merge — [api-admin #14](https://github.com/buscamissa/buscamissa-api-admin/pull/14) ✅ e [api-public #7](https://github.com/buscamissa/buscamissa-api-public/pull/7) ✅ (18/07); migration aplicada **via pipeline** (confirmado por leitura), endpoints 401 em dev como esperado

## Fase 5 — Frontend: solicitar e exercer responsabilidade
Branch: `feature/responsavel-verificado-fase5-6-site` (fases 5 e 6 juntas) + `fase5-badge` (api-public)

- [x] Botão "Sou o responsável" na página da igreja (só em não verificadas; anônimo → /entrar, logado → modal cargo/observação)
- [x] Verificação manual (cargo + "como confirmar" no modal → fila do admin) — upload de comprovante e token de e-mail institucional ficam para evolução
- [x] Badge "Responsável Verificado" na página pública (endpoint público anônimo com cache; herança incluída)
- [x] Teste local completo (badge direto/herança/ausente, redirect anônimo, solicitação persistida)
- [x] PR para `dev` e merge — [api-public #9](https://github.com/buscamissa/buscamissa-api-public/pull/9) ✅ e [front #93](https://github.com/FabioVeiga/buscamissa-frondend/pull/93) ✅ mesclados

## Fase 6 — Painel do responsável
Branch: `feature/responsavel-verificado-fase5-6-site` (junto com a fase 5)

- [x] Rota `modules/public/meu-painel/` (chips por status, motivo de rejeição/revogação, logout; login redireciona para o painel)
- [x] Edição direta: endereço, redes sociais, contato, horários, imagem — entregue nas Fases 8 e 9
- [x] Lista de capelas vinculadas (herdadas com chip "Gestão pela paróquia"; com responsável próprio não aparecem — local vence)
- [x] Teste local completo (painel com 3 vínculos e chips corretos)
- [ ] PR para `dev` e merge — mesmo PR da Fase 5 ([front #93](https://github.com/FabioVeiga/buscamissa-frondend/pull/93))

## Fase 7 — Moderação
Branch: `feature/responsavel-verificado-fase7-moderacao`

- [x] Fila de aprovação manual — endpoints na Fase 4; tela `/responsaveis` no frontend-admin (abas Fila/Histórico, ações contextuais, motivo obrigatório em rejeitar/revogar, badge de pendentes no menu)
- [ ] Fluxo de disputa (dois responsáveis alegando a mesma igreja) — hoje ambos ficam na fila e o admin decide manualmente; regra automática de trava fica para evolução
- [x] Teste local completo — fila, histórico com 3 status, aprovação via dialog (e-mail real via SendGrid), console limpo
- [x] PR para `dev` e merge — [frontend-admin #103](https://github.com/FabioVeiga/buscamissa-frondend-admin/pull/103) ✅ mesclado (item "Responsáveis Verificados" no submenu Igrejas)

## Fase 8 — Edição direta pelo responsável
Branch: `feature/responsavel-verificado-fase8-edicao(-direta)`

Recorte desta fatia: **contato + redes sociais + horários**. Endereço e imagem ficam para a próxima (mais sensíveis: geolocalização, slug de cidade, storage).

- [x] Backend api-public: `GET /responsavel/igreja/{id}/dados` + `PUT /responsavel/igreja/{id}/dados` (aplica direto na igreja real, transação)
- [x] Reaplica "responsável local vence" antes de gravar; listas substituem integralmente; contato nulo não altera
- [x] Horários editados → `FontePrincipal=SecretariaParoquial` + validados; redes → `Verificado=true`
- [x] Front: rota `/meu-painel/editar/:igrejaId` + `EditarIgrejaComponent` (FormArray redes/horários); botão "Editar" só nas editáveis (aprovada/herdada)
- [x] Teste local completo — 7 cenários backend (permissão/herança/replace/preservação) + edição via UI persistida no banco
- [x] PR para `dev` e merge — [api-public #10](https://github.com/buscamissa/buscamissa-api-public/pull/10) ✅ e [front #94](https://github.com/FabioVeiga/buscamissa-frondend/pull/94) ✅ mesclados

## Fase 9 — Edição de endereço + imagem
Branch: `feature/responsavel-verificado-fase9-endereco-imagem`

Última fatia da edição direta — fecha o pedido original completo.

- [x] `EnderecoEdicao`/`ImagemEdicao` em `EditarDadosIgrejaRequest`/`DadosEdicaoResponse`
- [x] **Decisão de arquitetura:** `NomeUnico`/`Slug` (identidade da URL) ficam **congelados** — nunca regenerados, protege SEO e links compartilhados; `CidadeSlug` (chave de agrupamento sitemap/listagem) é recalculado; `Estado`/`Regiao` derivados da UF (`ViaCepService.GetEstado/GetRegiao`)
- [x] Imagem reusa `ImagemService.UploadAzure` (mesmo container do fluxo colaborativo)
- [x] Front: seções Foto + Endereço no `EditarIgrejaComponent`; aviso visível quando cidade/UF muda avisando que a URL não muda
- [x] **Bug encontrado e corrigido:** URL da imagem montada sem o prefixo `igreja/` da pasta no blob (padrão usado em todo o resto do sistema) — corrigido e validado com upload real
- [x] Teste local completo — troca de UF/cidade (slug congelado confirmado no banco), upload de imagem real persistido no Blob Storage de dev, 403 sem permissão, isolamento de campos preservado
- [x] PR para `dev` e merge — [api-public #11](https://github.com/buscamissa/buscamissa-api-public/pull/11) ✅ e [front #95](https://github.com/FabioVeiga/buscamissa-frondend/pull/95) ✅ mesclados (19/07); endpoint confirmado respondendo em dev

---

## Encerramento

- [ ] `/auditoria-pre-prod` no conjunto das Fases 1–9 antes de ir para staging/produção
- [ ] Destruir o banco de teste `u466508834_bmrespteste` (Hostinger) após validação final
- [ ] Fora de escopo desta entrega (evoluções futuras): verificação automática por token de e-mail institucional; fluxo formal de disputa entre dois responsáveis da mesma igreja
