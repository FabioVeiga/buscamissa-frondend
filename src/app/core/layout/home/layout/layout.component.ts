import { Component } from "@angular/core";
import { CommonModule } from "@angular/common";
import { HeaderHomeComponent } from "../header/header.component";
import { FooterHomeComponent } from "../footer/footer.component";
import { RouterModule } from "@angular/router";
declare interface Window {
  adsbygoogle: any[];
}
declare var adsbygoogle: any[];
@Component({
  selector: "app-layout-home",
  imports: [
    CommonModule,
    HeaderHomeComponent,
    FooterHomeComponent,
    RouterModule,
  ],
  template: `<div class="layout-wrapper container">
    <div class="layout-main-container">
      <app-header-home></app-header-home>
      <div class="layout-main">
        <div class="card"><router-outlet></router-outlet></div>
      </div>
      <app-footer-home></app-footer-home>
    </div>
    <div class="layout-mask animate-fadein"></div>
  </div> `,
  styles: [
    `
      .ads_resp {
        width: 320px;
        height: 100px;
        margin: 0 auto;
      }
      @media (min-width: 500px) {
        .ads_resp {
          width: 480px;
          height: 60px;
        }
      }
      @media (min-width: 900px) {
        .ads_resp {
          width: 900px;
          height: 90px;
        }
      }
    `,
  ],
})
export class LayoutHomeComponent {
  patrocinioDireita = "";
  patrocinioEsquerda = "";

  ngAfterViewInit() {
    setTimeout(() => {
      try {
        (window as any).adsbygoogle = (window as any).adsbygoogle || [];
        (window as any).adsbygoogle.push({});
      } catch (e) {
        console.error("ads", e);
      }
    }, 900);
  }
}
