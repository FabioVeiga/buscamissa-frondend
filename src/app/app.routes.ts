import { Routes } from "@angular/router";
import { LayoutHomeComponent } from "./core/layout/home/layout/layout.component";

export const routes: Routes = [
  {
    path: "",
    component: LayoutHomeComponent,
    children: [
      {
        path: "home",
        loadComponent: () =>
          import("./modules/public/home/home.component").then(
            (m) => m.HomeComponent
          ),
      },
      {
        path: "nova",
        loadComponent: () =>
          import(
            "./modules/public/church/pages/church-registration-page/church-registration-page.component"
          ).then((m) => m.ChurchRegistrationPageComponent),
      },
      {
        path: "editar/:id",
        loadComponent: () =>
          import(
            "./modules/public/church/pages/church-edit-page/church-edit-page.component"
          ).then((m) => m.ChurchEditPageComponent),
      },
      {
        path: "detalhes/:cep",
        loadComponent: () =>
          import("./modules/public/home/details/details.component").then(
            (m) => m.DetailsComponent
          ),
      },
      {
        path: "enviar-codigo/:controleId",
        loadComponent: () =>
          import(
            "./modules/public/register-church/send-code/send-code.component"
          ).then((m) => m.SendCodeComponent),
      },
      {
        path: "validar",
        loadComponent: () =>
          import(
            "./modules/public/register-church/validate-code/validate-code.component"
          ).then((m) => m.ValidateCodeComponent),
      },
      {
        path: "anuncios",
        loadComponent: () =>
          import("./modules/public/sponsors/sponsors.component").then(
            (m) => m.SponsorsComponent
          ),
      },
      {
        path: "contribuir",
        loadComponent: () =>
          import("./modules/public/contribute/contribute.component").then(
            (m) => m.ContributeComponent
          ),
      },
      {
        path: "solicitar",
        loadComponent: () =>
          import("./modules/public/request/request.component").then(
            (m) => m.RequestComponent
          ),
      },
      { path: "", redirectTo: "home", pathMatch: "full" },
    ],
  },
  { path: "**", redirectTo: "home", pathMatch: "full" },
];
