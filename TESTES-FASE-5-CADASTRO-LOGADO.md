# 🧪 Testes - Fase 5: Cadastro de Igreja para Usuários Logados

## Objetivo
Validar que o fluxo de cadastro de igreja funciona corretamente para usuários logados, pulando a validação por email e pré-preenchendo dados quando necessário.

---

## 📋 Cenários de Teste

### Teste 1: Usuário Logado Criando Nova Igreja → Sem Validação
**Objetivo**: Verificar que usuários logados pular a validação por email e vão direto para `/meu-painel`

**Pré-requisitos**:
- [ ] Estar logado como usuário verificado
- [ ] Estar na página `/nova`

**Passos**:
1. Preencher formulário com dados válidos (CEP, nome, etc)
2. Clicar em "Cadastrar"
3. Sistema envia requisição POST `/api/v1/Igreja`

**Resultado Esperado**:
- ✅ Igreja é criada com sucesso
- ✅ Usuário é redirecionado para `/meu-painel` (não `/enviar-codigo`)
- ✅ Mensagem de sucesso: "Cadastrada, vamos validar!"

**Status**: 🔲 Não testado

---

### Teste 2: Usuário Logado Solicitando Responsabilidade de Igreja Existente
**Objetivo**: Verificar que usuário pode ir para `/nova?nomeUnico=...` e pré-popular o formulário

**Pré-requisitos**:
- [ ] Estar logado como usuário verificado
- [ ] Acessar página de detalhe de uma igreja (ex: `/paroquia/sp/sao-paulo/paroquia-teste`)
- [ ] Igreja não verificada (botão "Solicitar Responsabilidade" visível)

**Passos**:
1. Clicar em "Solicitar Responsabilidade" na página de detalhe
2. Sistema redireciona para `/nova?nomeUnico=paroquia-teste`
3. Formulário deve estar pré-preenchido com dados da igreja
4. Campos de localização (CEP, endereco, UF, etc) devem estar desabilidados

**Resultado Esperado**:
- ✅ Formulário pré-preenchido com nome, tipo, endereço da igreja
- ✅ Campos de localização desabilitados (não editáveis)
- ✅ Usuário pode ajustar outros campos (nome paroco, contato, etc)
- ✅ Ao submeter, vai para `/meu-painel` (sem validação email)

**Status**: 🔲 Não testado

---

### Teste 3: Usuário NÃO Logado → Mantém Fluxo de Validação
**Objetivo**: Verificar que usuários não logados ainda usam o fluxo de validação por email

**Pré-requisitos**:
- [ ] Estar deslogado (anonimo)
- [ ] Estar na página `/nova`

**Passos**:
1. Preencher formulário com dados válidos
2. Clicar em "Cadastrar"
3. Sistema envia requisição POST `/api/v1/Igreja`

**Resultado Esperado**:
- ✅ Igreja é criada com sucesso
- ✅ Usuário é redirecionado para `/enviar-codigo/:controleId`
- ✅ Sistema mostra formulário de validação com email
- ✅ Usuário pode receber código por email e validar

**Status**: 🔲 Não testado

---

### Teste 4: Responsável Não Consegue Cadastrar 2x Mesma Igreja
**Objetivo**: Verificar que o sistema impede duplicatas de responsabilidade

**Pré-requisitos**:
- [ ] Estar logado como usuário verificado
- [ ] Ter uma solicitação de responsabilidade já enviada para uma igreja

**Passos**:
1. Tentar acessar `/nova?nomeUnico=paroquia-ja-solicitada` novamente
2. Ou tentar criar uma nova solicitação para a mesma igreja

**Resultado Esperado**:
- ✅ Sistema avisa que já existe solicitação pendente
- ✅ Mensagem: "Você já tem uma solicitação pendente para esta igreja"
- ✅ Impede que novo cadastro seja criado

**Status**: 🔲 Não testado

---

## ✅ Resultado Final

| Teste | Status | Notas |
|-------|--------|-------|
| Teste 1 | 🔲 | Usuário logado → sem validação |
| Teste 2 | 🔲 | Pré-popular + desabilitar campos |
| Teste 3 | 🔲 | Usuário anônimo → validação email |
| Teste 4 | 🔲 | Impedir duplicatas |

**Total**: 0/4 testes passando

---

## 🚀 Instruções de Execução

### Local Dev
```bash
cd /Users/fabioveiga/projects/buscamissaprojeto/buscamissa-frondend
npm run start -- --port 4300
# Abrir http://localhost:4300/home
```

### Checklist de Testes
- [ ] Teste 1: Usuário logado criando nova igreja
- [ ] Teste 2: Usuário logado solicitando responsabilidade
- [ ] Teste 3: Usuário anônimo mantém validação
- [ ] Teste 4: Validar impedimento de duplicatas

---

## 📝 Notas de Implementação

### Mudanças Realizadas (Fase 1-4)
1. **Fase 1**: Detectar usuário logado via `AuthService.estaLogado`
2. **Fase 2**: Condicionar redirecionamento (se logado → `/meu-painel`, senão → `/enviar-codigo`)
3. **Fase 3**: Pré-popular formulário com dados da igreja via query param `?nomeUnico=...`
4. **Fase 4**: Adicionar botão na página de detalhe que redireciona para `/nova?nomeUnico=...`

### Pontos Críticos
- Backend deve validar JWT antes de permitir criação/edição
- Igreja só é criada se usuário está autenticado
- Query param `nomeUnico` deve carregar dados via `getByNomeUnico()`
- Campos de localização devem ser desabilitados após pré-preenchimento
