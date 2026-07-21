# 📋 PLANO: Otimizar Fluxo de Cadastro de Igreja para Usuários Logados

## 🎯 Objetivo
Permitir que usuários já **logados/verificados** cadastrem uma igleja **sem passar pela validação por email** novamente, pois já estão autenticados.

---

## 📊 Cenários Atuais vs Proposto

### ❌ Fluxo Atual
1. Usuário visitava `/nova`
2. Preenchia formulário de criação de igreja
3. Sistema enviava **código de verificação por email**
4. Usuário confirmava código
5. Igreja era criada

**Problema**: Usuários logados fazem validação redundante

### ✅ Fluxo Proposto
1. **Se usuário NÃO está logado**: → Fluxo atual (validação por email)
2. **Se usuário ESTÁ logado**: → Ir direto para confirmar responsabilidade
   - Preenche dados da igreja
   - **Sistema marca como "pendente responsabilidade"** (não precisa validar email)
   - Responsável pode fazer solicitação de responsabilidade do novo cadastro
   - Admin valida legitimidade depois

---

## 🏗️ Alterações Necessárias

### **Backend (API Pública)**
- ✅ **POST `/api/v1/igreja`** - Já existe, já faz criação sem validação
- ⚠️ Adicionar flag/estado: `CriadoPorResponsavelLogado` (bool)
- ⚠️ Endpoint para responsável logado **solicitar responsabilidade de sua própria criação**

### **Frontend (Angular)**
- 📝 **`church-registration-page.component.ts`** - Detectar se usuário está logado
  - Se logado → pular validação email
  - Se não logado → manter validação
  
- 📝 **`church-registration-page.component.html`** - Condicional no fluxo
  - Se logado: mostrar "confirmar responsabilidade"
  - Se não logado: mostrar fluxo validação normal

- 📝 **`guia-responsavel.component.html`** - Adicionar link
  - Na seção de detalhe "Você é o responsável por esta igreja?"
  - Link → `/nova` (com flag `returnTo=/guia-responsavel`)

- ✅ **`guia-responsavel.component.ts/html/scss`** - Já criado ✓

### **Página de Detalhe de Igreja**
- 📝 Onde adicionar: Na seção "Você é o responsável por esta igreja?"
- Link: `"/nova?igrejaId=123"` ou `"/nova?responsibilidadeIgrejaId=123"`
- Comportamento: Pré-popula dados da igreja no cadastro

---

## 🔄 Fluxo Detalhado (Usuário Logado)

### Início: Página de Detalhe
```
[Página Detalhe da Igreja]
     ↓
"Você é o responsável por esta igreja?"
     ↓
[Botão] "Solicitar Responsabilidade" 
     ↓
Redireciona para → /nova?igrejaId={id}
```

### Cadastro: Igreja Já Existe
```
1. URL carrega com ?igrejaId=123
2. Sistema verifica:
   - ✓ Usuário está logado?
   - ✓ Igreja já existe?
   - ✓ Usuário já tem responsabilidade nela?
3. Mostra formulário PRÉ-PREENCHIDO
4. Usuário apenas confirma/ajusta dados
5. Sistema cria solicitação de responsabilidade
6. Admin valida depois
```

### Cadastro: Usuário Quer Criar Nova Igreja
```
1. URL sem ?igrejaId (ou usuário clica "cadastrar nova")
2. Usuário preenche todos dados
3. Sistema cria igreja + marca como "criada por responsável"
4. Sistema automaticamente cria solicitação de responsabilidade
5. Admin valida depois
```

---

## 📋 Checklist de Implementação

### Fase 1: Detectar Usuário Logado ✅
**Branch**: `feature/cadastro-fase-1-detectar-usuario`
**Status**: Concluído
- [x] Injetar `AuthService` em `church-registration-page.component`
- [x] Verificar `this._auth.estaLogado`
- [x] Se logado: definir flag `usuarioLogado = true`

### Fase 2: Condicionar Validação Email ✅
**Branch**: `feature/cadastro-fase-2-validacao-email`
**Status**: Concluído
- [x] Se `usuarioLogado` → pular validação email e ir para /meu-painel
- [x] Se não logado → manter fluxo atual (/enviar-codigo)
- [x] Condicionar redirecionamento com if/else no handleFormSubmit

### Fase 3: Pré-popular Igreja ✅
**Branch**: `feature/cadastro-fase-3-prepopular`
**Status**: Concluído
- [x] Detectar query param `?nomeUnico=paroquia-nome`
- [x] Buscar dados via getByNomeUnico
- [x] Pré-preencher formulário
- [x] Desabilitar campos de localização (CEP, endereço, cidade, UF, etc)

### Fase 4: Link na Página de Detalhe
**Branch**: `feature/cadastro-fase-4-link-detalhe`
- [ ] Localizar seção "Você é o responsável por esta igreja?"
- [ ] Adicionar botão/link → `/nova` ou `/solicitar-responsabilidade`
- [ ] Passar `igrejaId` como query param
- [ ] Estilizar conforme design do projeto

### Fase 5: Testes
**Branch**: `feature/cadastro-fase-5-testes`
- [ ] ✓ Usuário logado criando nova igreja → sem validação
- [ ] ✓ Usuário logado solicitando responsabilidade existente
- [ ] ✓ Usuário NÃO logado → mantém validação
- [ ] ✓ Responsável não consegue cadastrar 2x mesma igreja

---

## 🎨 UX/Design

### Página de Detalhe
```
[Seção: Você é o responsável?]
┌─────────────────────────────────┐
│ Você é o responsável por esta   │
│ paróquia? Mantenha as           │
│ informações sempre atualizadas! │
│                                 │
│ [✓ Solicitar Responsabilidade]  │ ← Novo botão
└─────────────────────────────────┘
```

### Fluxo Cadastro (Se Logado)
```
[Step 1: Dados da Igreja]
├─ CEP/Localização
├─ Nome
├─ Tipo (Paróquia/Capela)
└─ Contato
    ↓
[Step 2: Confirmar Responsabilidade]
├─ ✓ "Sou responsável pela paróquia acima"
├─ Email verificado: user@email.com
└─ [Finalizar] → Cria solicitação
```

---

## ⚠️ Considerações Importantes

1. **Validação no Backend**: 
   - Mesmo que frontend pule, backend deve validar JWT token
   - Usuário apenas cria/edita se autenticado

2. **Duplicação de Igrejas**:
   - Não permitir 2 solicitações da mesma responsabilidade
   - Sistema deve avisar se já existe solicitação pendente

3. **Auditoria**:
   - Registrar qual usuário criou a igreja
   - Registrar quem solicitou responsabilidade

4. **Reversibilidade**:
   - Se solicitação for rejeitada, admin pode liberar para outro usuário?
   - Design esse fluxo depois

---

## 📝 Prioridade
- **Alta**: Fases 1-2 (detectar e pular validação)
- **Média**: Fase 3 (pré-popular dados)
- **Média**: Fase 4 (link na página de detalhe)
- **Baixa**: Fase 5 (testes automatizados)

---

## 🚀 Próximos Passos
1. ✅ Branches criadas a partir de `dev`:
   - `feature/cadastro-fase-1-detectar-usuario`
   - `feature/cadastro-fase-2-validacao-email`
   - `feature/cadastro-fase-3-prepopular`
   - `feature/cadastro-fase-4-link-detalhe`
   - `feature/cadastro-fase-5-testes`

2. Iniciar com `git checkout feature/cadastro-fase-1-detectar-usuario`
3. Implementar conforme checklist
4. Criar PR para review antes de merge em `dev`

