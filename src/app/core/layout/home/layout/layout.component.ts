import { Component } from "@angular/core";
import { CommonModule } from "@angular/common";
import { HeaderHomeComponent } from "../header/header.component";
import { FooterHomeComponent } from "../footer/footer.component";
import { RouterModule } from "@angular/router";

@Component({
  selector: "app-layout-home",
  imports: [
    CommonModule,
    HeaderHomeComponent,
    FooterHomeComponent,
    RouterModule,
  ],
  template: `<div class="layout-wrapper container">
    <app-header-home></app-header-home>
    <div class="layout-main-container">
      <div class="layout-main">
        <div class="card"><router-outlet></router-outlet></div>
      </div>
      <app-footer-home></app-footer-home>
    </div>
    <div class="layout-mask animate-fadein"></div>
  </div> `,
})
export class LayoutHomeComponent {
  patrocinioDireita = '';
  patrocinioEsquerda = '';
}
