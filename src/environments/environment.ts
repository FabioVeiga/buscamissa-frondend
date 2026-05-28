import { appInfo, applicationBase } from './environment.common';

export const environment = {
  appInfo,
  application: {
    ...applicationBase,
    angular: `${applicationBase.angular} DEV`,
  },
  config: {
    production: false,
    apiURL: "https://busca-missa-dev.azurewebsites.net/api/",
    token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6ImRyb2lkYmluaG9AZ21haWwuY29tIiwicm9sZSI6IkFwcCIsIm5iZiI6MTc0NjAxNjA1MCwiZXhwIjoyMDYxNTQ4ODUwLCJpYXQiOjE3NDYwMTYwNTB9.3wAiOGxU0YJTpUsG0CJjYJa2CBSodxel9P1XPO8TCLU",
  },
};
