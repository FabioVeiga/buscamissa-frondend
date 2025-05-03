import { appInfo, applicationBase } from './environment.common';

export const environment = {
  appInfo,
  application: {
    ...applicationBase,
    angular: `${applicationBase.angular} DEV`,
  },
  config: {
    production: false,
    apiURL: "https://busca-missa.azurewebsites.net/api/",
    token:"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6ImRyb2lkYmluaG9AZ21haWwuY29tIiwicm9sZSI6IkFwcCIsIm5iZiI6MTc0NjE0ODE5NywiZXhwIjoyMDYxNjgwOTk3LCJpYXQiOjE3NDYxNDgxOTd9.TP3GPb6RVPphfJSn5PWnV7r16CoOZrvHIESO2X5X0lg",
  },
};
