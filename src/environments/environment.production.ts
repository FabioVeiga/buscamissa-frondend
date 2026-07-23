import { appInfo, applicationBase } from './environment.common';

export const environment = {
  appInfo,
  application: {
    ...applicationBase,
    angular: `${applicationBase.angular} PROD`,
  },
  config: {
    production: true,
    apiURL: "https://app-buscamissa-prod-api-public.azurewebsites.net/api/",
    // ⚠️ DÉBITO DE SEGURANÇA (Auditoria2 / item S2): este é um JWT de aplicação
    // (role "App") de vida-longa embutido no bundle do browser — visível a
    // qualquer visitante. Não pode ser removido cru porque a API exige o token
    // "App" em vários endpoints. Remediação (bloco futuro, acoplado ao backend):
    //   1. ROTACIONAR/REVOGAR este token (ação manual — o token atual já vazou).
    //   2. Emitir o token de app em runtime (endpoint público de bootstrap) ou
    //      tornar públicos os endpoints de leitura que hoje exigem "App".
    token:"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6ImRyb2lkYmluaG9AZ21haWwuY29tIiwicm9sZSI6IkFwcCIsIm5iZiI6MTc4MzE3NDg2NSwiZXhwIjoyMDk4NTM0ODY1LCJpYXQiOjE3ODMxNzQ4NjUsImlzcyI6IkJ1c2NhTWlzc2EiLCJhdWQiOiJCdXNjYU1pc3NhQXBpIn0.ahJduNioP3xj0dsub4r2ZX_sGUpVcfaiJLVITQfY7x4",
  },
};
