import { Component, OnInit, inject } from '@angular/core';
import { PrimeNgModule } from '../../../../shared/primeng.module';
import { MetricasService, PaginaMetrica } from '../../../../core/services/metricas.service';
import { ConsentService } from '../../../../core/services/consent.service';

@Component({
  selector: 'app-cookies',
  imports: [PrimeNgModule],
  templateUrl: './cookies.component.html',
  styleUrl: './cookies.component.scss'
})
export class CookiesComponent implements OnInit {
  private _metricas = inject(MetricasService);
  private _consent = inject(ConsentService);

  abrirPreferencias(): void {
    this._consent.abrirPreferencias();
  }

  ngOnInit(): void {
    this._metricas.registrarVisualizacaoPagina(PaginaMetrica.Cookies);
  }
}
