import { Component, OnInit, inject } from '@angular/core';
import { PrimeNgModule } from '../../../../shared/primeng.module';
import { MetricasService, PaginaMetrica } from '../../../../core/services/metricas.service';

@Component({
  selector: 'app-terms',
  imports: [PrimeNgModule],
  templateUrl: './terms.component.html',
  styleUrl: './terms.component.scss'
})
export class TermsComponent implements OnInit {
  private _metricas = inject(MetricasService);

  ngOnInit(): void {
    this._metricas.registrarVisualizacaoPagina(PaginaMetrica.Termos);
  }
}
