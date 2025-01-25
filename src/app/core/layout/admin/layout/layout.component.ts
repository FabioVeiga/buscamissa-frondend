import { Component } from "@angular/core";
import { HeaderComponent } from "../header/header.component";
import { SidebarComponent } from "../sidebar/sidebar.component";
import { RouterModule } from "@angular/router";

@Component({
  selector: "app-layout",
  imports: [HeaderComponent, SidebarComponent, RouterModule],
  templateUrl: "./layout.component.html",
  styleUrl: "./layout.component.scss",
})
export class LayoutComponent {}
