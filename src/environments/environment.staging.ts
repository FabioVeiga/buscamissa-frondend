import { appInfo, applicationBase } from './environment.common';

export const environment = {
  appInfo,
  application: {
    ...applicationBase,
    angular: `${applicationBase.angular} HML`,
  },
  config: {
    production: false,
    apiURL: "https://busca-missa-dev.azurewebsites.net/api/v1/",
    token:"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6ImRyb2lkYmluaG9AZ21haWwuY29tIiwicm9sZSI6IkFwcCIsIm5iZiI6MTc3OTg4ODcwMiwiZXhwIjoyMDk1NTA3OTAyLCJpYXQiOjE3Nzk4ODg3MDJ9.53g3s-HgKdfrunBVthBF5d_CIQV12yRoDz0L7ddmAos",
  },
};
