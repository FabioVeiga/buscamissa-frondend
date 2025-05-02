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
    token:"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6ImRyb2lkYmluaG9AZ21haWwuY29tIiwicm9sZSI6IkFwcCIsIm5iZiI6MTc0NjE1MDA2MywiZXhwIjoyMDYxNjgyODYzLCJpYXQiOjE3NDYxNTAwNjN9.0OpyelDRkgwgKr4WTAptfD3dvSrkNv42qo-QYnWJFKQ",
  },
};
