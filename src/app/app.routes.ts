import { Routes } from "@angular/router";
import { HomeComponent } from "./modules/public/home/home.component";
import { LoginComponent } from "./modules/admin/login/login.component";
import { DashboardComponent } from "./modules/admin/dashboard/dashboard.component";
import { LayoutHomeComponent } from "./core/layout/home/layout/layout.component";
import { LayoutComponent } from "./core/layout/admin/layout/layout.component";
import { RegisterChurchComponent } from "./modules/public/register-church/register-church.component";

export const routes: Routes = [
  {
    path: '',
    component: LayoutHomeComponent,
    children: [
      { path: 'home', component: HomeComponent },
      { path: 'nova', component: RegisterChurchComponent },
      { path: "", redirectTo: "home", pathMatch: "full" },
    ]
  },
  {
    path: "painel",
    component: LayoutComponent,
    children: [
      { path: 'login', component: LoginComponent },
      { path: 'dashboard', component: DashboardComponent },
      { path: "", redirectTo: "login", pathMatch: "full" },
    ],
  },
  { path: "**", redirectTo: "home", pathMatch: "full" },
];
