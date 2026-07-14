import { appInfo, applicationBase } from './environment.common';

export const environment = {
  appInfo,
  application: {
    ...applicationBase,
    angular: `${applicationBase.angular} PROD`,
  },
  config: {
    production: true,
    apiURL: "https://busca-missa.azurewebsites.net/api/",
    token:"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6ImRyb2lkYmluaG9AZ21haWwuY29tIiwicm9sZSI6IkFwcCIsIm5iZiI6MTc4MzE3NDg2NSwiZXhwIjoyMDk4NTM0ODY1LCJpYXQiOjE3ODMxNzQ4NjUsImlzcyI6IkJ1c2NhTWlzc2EiLCJhdWQiOiJCdXNjYU1pc3NhQXBpIn0.ahJduNioP3xj0dsub4r2ZX_sGUpVcfaiJLVITQfY7x4",
  },
  // Desligado enquanto produção apontar pro monólito (sem os endpoints de
  // desafio). Ligar junto com o cutover para o api-public.
  features: {
    validacaoSemEmail: false,
  },
};
