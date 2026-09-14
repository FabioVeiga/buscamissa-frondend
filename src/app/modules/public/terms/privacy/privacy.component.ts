import { Component, OnInit, inject } from '@angular/core';
import { PrimeNgModule } from '../../../../shared/primeng.module';
import { MetricasService, PaginaMetrica } from '../../../../core/services/metricas.service';

@Component({
  selector: 'app-privacy',
  imports: [PrimeNgModule],
  templateUrl: './privacy.component.html',
  styleUrl: './privacy.component.scss'
})
export class PrivacyComponent implements OnInit {
  private _metricas = inject(MetricasService);

  ngOnInit(): void {
    this._metricas.registrarVisualizacaoPagina(PaginaMetrica.Privacidade);
  }
}
