import { appInfo, applicationBase } from './environment.common';

export const environment = {
  appInfo,
  application: {
    ...applicationBase,
    angular: `${applicationBase.angular} DEV`,
  },
  config: {
    production: false,
    apiURL: "https://app-buscamissa-dev-api-public.azurewebsites.net/api/",
    // Token App rotacionado (SecretApp novo do Key Vault de dev), já com claims iss/aud.
    token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6ImRyb2lkYmluaG9AZ21haWwuY29tIiwicm9sZSI6IkFwcCIsIm5iZiI6MTc4MzE2NTczOCwiZXhwIjoyMDk4Nzg0OTM4LCJpYXQiOjE3ODMxNjU3MzgsImlzcyI6IkJ1c2NhTWlzc2EiLCJhdWQiOiJCdXNjYU1pc3NhQXBpIn0.OrQTwTkloZMHvRk-C4IcAZ5I6M3gtWXmv3uGksTrmD4",
  },
  // Validação da contribuição por desafio matemático em vez de código por
  // e-mail (MailerSend indisponível). Requer o toggle equivalente
  // (Features:ValidacaoSemEmail) ligado na API.
  features: {
    validacaoSemEmail: true,
  },
};