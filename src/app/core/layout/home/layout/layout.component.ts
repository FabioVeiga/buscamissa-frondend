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
  template: `<div class="layout-wrapper" style="padding:3px">
    <a class="skip-link" href="#conteudo">Pular para o conteúdo</a>
    <div class="layout-main-container">
      <app-header-home></app-header-home>
      <main id="conteudo" tabindex="-1" class="layout-main">
        <div class="card"><router-outlet></router-outlet></div>
      </main>
      <app-footer-home></app-footer-home>
    </div>
    <div class="layout-mask animate-fadein"></div>
  </div> `,
  styles: [`
    .skip-link {
      position: absolute;
      left: -9999px;
      top: 0;
      z-index: 1000;
      background: #bc5d10;
      color: #fff;
      padding: 0.5rem 1rem;
      border-radius: 0 0 0.5rem 0;
      font-weight: 600;
      text-decoration: none;
    }
    .skip-link:focus {
      left: 0;
    }
    /* O foco programático no <main> ao trocar de rota não deve exibir outline */
    main:focus { outline: none; }
  `],
})
export class LayoutHomeComponent {

}
