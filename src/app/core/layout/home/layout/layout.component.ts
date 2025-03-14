import { Component } from "@angular/core";
import { CommonModule } from "@angular/common";
import { HeaderHomeComponent } from "../header/header.component";
import { FooterHomeComponent } from "../footer/footer.component";
import { RouterModule } from "@angular/router";

@Component({
  selector: "app-layout-home",
  imports: [CommonModule, HeaderHomeComponent, FooterHomeComponent,RouterModule],
  templateUrl: "./layout.component.html",
  styleUrls: ["./layout.component.scss"],
})
export class LayoutHomeComponent {}