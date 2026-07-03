import { appInfo, applicationBase } from './environment.common';

export const environment = {
  appInfo,
  application: {
    ...applicationBase,
    angular: `${applicationBase.angular} DEV`,
  },
  config: {
    production: false,
    apiURL: "https://localhost:7129/api/",
    // TODO(auditoria 1.7): token pendente de regeneração com o SecretApp rotacionado
    // do Key Vault de dev. Gerar com backend/Scripts/gerar-token-app.ps1 (inclui iss/aud)
    // e substituir aqui. O valor abaixo NÃO valida contra o Key Vault de dev atual.
    token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6ImRyb2lkYmluaG9AZ21haWwuY29tIiwicm9sZSI6IkFwcCIsIm5iZiI6MTc4MzA0Mjg2NCwiZXhwIjoyMDk4NjYyMDY0LCJpYXQiOjE3ODMwNDI4NjR9.PYMYhl4T1gvKtqhBHWXWcZr0JrAVCdeSyrE_V6rdQV4",
  },
};