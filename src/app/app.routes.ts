import { Routes } from "@angular/router";
import { HomeComponent } from "./modules/public/home/home.component";
import { LayoutHomeComponent } from "./core/layout/home/layout/layout.component";
import { RegisterChurchComponent } from "./modules/public/register-church/register-church.component";
import { SponsorsComponent } from "./modules/public/sponsors/sponsors.component";
import { SendCodeComponent } from "./modules/public/register-church/send-code/send-code.component";
import { ValidateCodeComponent } from "./modules/public/register-church/validate-code/validate-code.component";

export const routes: Routes = [
  {
    path: "",
    component: LayoutHomeComponent,
    children: [
      { path: "home", component: HomeComponent },
      { path: "nova", component: RegisterChurchComponent },
      { path: "enviar-codigo/:controleId", component: SendCodeComponent },
      { path: "validar", component: ValidateCodeComponent },
      { path: "patrocinadores", component: SponsorsComponent },
      { path: "", redirectTo: "home", pathMatch: "full" },
    ],
  },
  { path: "**", redirectTo: "home", pathMatch: "full" },
];
