import { Component, OnInit, inject } from '@angular/core';
import { PrimeNgModule } from '../../../../shared/primeng.module';
import { MetricasService, PaginaMetrica } from '../../../../core/services/metricas.service';

@Component({
  selector: 'app-cookies',
  imports: [PrimeNgModule],
  templateUrl: './cookies.component.html',
  styleUrl: './cookies.component.scss'
})
export class CookiesComponent implements OnInit {
  private _metricas = inject(MetricasService);

  ngOnInit(): void {
    this._metricas.registrarVisualizacaoPagina(PaginaMetrica.Cookies);
  }
}
