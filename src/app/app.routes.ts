import { Routes } from "@angular/router";
import { HomeComponent } from "./modules/public/home/home.component";
import { LoginComponent } from "./modules/admin/login/login.component";
import { DashboardComponent } from "./modules/admin/dashboard/dashboard.component";
import { LayoutHomeComponent } from "./core/layout/home/layout/layout.component";
import { LayoutComponent } from "./core/layout/admin/layout/layout.component";
import { RegisterChurchComponent } from "./modules/public/register-church/register-church.component";
import { SponsorsComponent } from "./modules/public/sponsors/sponsors.component";
import { SendCodeComponent } from "./modules/public/register-church/send-code/send-code.component";

export const routes: Routes = [
  {
    path: '',
    component: LayoutHomeComponent,
    children: [
      { path: 'home', component: HomeComponent },
      { path: 'nova', component: RegisterChurchComponent },
      { path: 'nova/:id', component: SendCodeComponent },
      { path: 'patrocinadores', component: SponsorsComponent },
      { path: "", redirectTo: "home", pathMatch: "full" },
    ]
  },
  { path: "**", redirectTo: "home", pathMatch: "full" },
];
