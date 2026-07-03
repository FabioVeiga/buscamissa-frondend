import { appInfo, applicationBase } from './environment.common';

export const environment = {
  appInfo,
  application: {
    ...applicationBase,
    angular: `${applicationBase.angular} HML`,
  },
  config: {
    production: false,
    apiURL: "https://busca-missa-dev.azurewebsites.net/api/",
    // TODO(auditoria 1.7): token pendente de regeneração com o SecretApp rotacionado
    // do Key Vault de dev. Gerar com backend/Scripts/gerar-token-app.ps1 (inclui iss/aud)
    // e substituir aqui. Requer também restart do App Service busca-missa-dev para
    // recarregar o secret. O valor abaixo NÃO valida contra o dev atual.
    token:"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6ImRyb2lkYmluaG9AZ21haWwuY29tIiwicm9sZSI6IkFwcCIsIm5iZiI6MTc4MzA0Mjg2NCwiZXhwIjoyMDk4NjYyMDY0LCJpYXQiOjE3ODMwNDI4NjR9.PYMYhl4T1gvKtqhBHWXWcZr0JrAVCdeSyrE_V6rdQV4",
  },
};
