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
    token:"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6ImRyb2lkYmluaG9AZ21haWwuY29tIiwicm9sZSI6IkFwcCIsIm5iZiI6MTc0NjE0Njc1NSwiZXhwIjoyMDYxNjc5NTU1LCJpYXQiOjE3NDYxNDY3NTV9.Pw1tADQXYEpu_Fz9Nkt-8gwS9v56-d2bekAXEHB4p5oeyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6InN1cG9ydGVAYnVzY2FybWlzc2EuY29tLmJyIiwicm9sZSI6IkFwcCIsIm5iZiI6MTczMDk0MjQ4NCwiZXhwIjoyMDQ2NDc1Mjg0LCJpYXQiOjE3MzA5NDI0ODR9.2UEel10ImLMm-kT2ROFMRp7lax46IZ1VPSkloNw9bqg",
  },
};
