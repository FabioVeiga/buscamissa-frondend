import { Routes } from "@angular/router";
import { HomeComponent } from "./modules/public/home/home.component";
import { LayoutHomeComponent } from "./core/layout/home/layout/layout.component";
import { RegisterChurchComponent } from "./modules/public/register-church/register-church.component";
import { SponsorsComponent } from "./modules/public/sponsors/sponsors.component";
import { SendCodeComponent } from "./modules/public/register-church/send-code/send-code.component";
import { ValidateCodeComponent } from "./modules/public/register-church/validate-code/validate-code.component";
import { DetailsComponent } from "./modules/public/home/details/details.component";
import { ChurchEditPageComponent } from "./modules/public/church/pages/church-edit-page/church-edit-page.component";
import { ChurchRegistrationPageComponent } from "./modules/public/church/pages/church-registration-page/church-registration-page.component";

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
      { path: "", redirectTo: "home", pathMatch: "full" },
    ],
  },
  { path: "**", redirectTo: "home", pathMatch: "full" },
];
