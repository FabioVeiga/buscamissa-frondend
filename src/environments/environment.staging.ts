import { appInfo, applicationBase } from './environment.common';

export const environment = {
  appInfo,
  application: {
    ...applicationBase,
    angular: `${applicationBase.angular} HML`,
  },
  config: {
    production: false,
    apiURL: "https://busca-missa-dev-api.azurewebsites.net/api/",
    token:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6InN1cG9ydGVAYnVzY2FybWlzc2EuY29tLmJyIiwicm9sZSI6IkFwcCIsIm5iZiI6MTczMDk0MjQ4NCwiZXhwIjoyMDQ2NDc1Mjg0LCJpYXQiOjE3MzA5NDI0ODR9.2UEel10ImLMm-kT2ROFMRp7lax46IZ1VPSkloNw9bqg",
  },
};
