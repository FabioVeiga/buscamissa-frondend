import { Component, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { ConsentService } from '../../../services/consent.service';

@Component({
  selector: 'app-footer-home',
  imports: [RouterModule],
  templateUrl: './footer.component.html',
  styleUrl: './footer.component.scss'
})
export class FooterHomeComponent {
  private _consent = inject(ConsentService);
  currentYear = new Date().getFullYear();

  abrirPreferenciasCookies(): void {
    this._consent.abrirPreferencias();
  }
}
