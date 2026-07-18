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
- [ ] PR para `dev` e merge — abertos: [api-admin #14](https://github.com/buscamissa/buscamissa-api-admin/pull/14) (mesclar PRIMEIRO — pipe aplica a migration, sem passo manual) e [api-public #7](https://github.com/buscamissa/buscamissa-api-public/pull/7)

## Fase 5 — Frontend: solicitar e exercer responsabilidade
Branch: `feature/responsavel-verificado-fase5-solicitar`

- [ ] Botão "Sou o responsável" na página da igreja
- [ ] Fluxo de verificação por token de e-mail institucional
- [ ] Fluxo de verificação manual (upload de comprovante)
- [ ] Badge "Responsável Verificado ✓" na página pública
- [ ] Teste local completo (front local + api local)
- [ ] PR para `dev` e merge

## Fase 6 — Painel do responsável
Branch: `feature/responsavel-verificado-fase6-painel`

- [ ] Rota `modules/public/meu-painel/`
- [ ] Edição direta: endereço, redes sociais, contato, horários, imagem
- [ ] Lista de capelas vinculadas (editáveis vs. bloqueadas por responsável próprio)
- [ ] Teste local completo
- [ ] PR para `dev` e merge

## Fase 7 — Moderação
Branch: `feature/responsavel-verificado-fase7-moderacao`

- [ ] Fila de aprovação manual no `AdminController`
- [ ] Fluxo de disputa (dois responsáveis alegando a mesma igreja)
- [ ] Teste local completo
- [ ] PR para `dev` e merge
