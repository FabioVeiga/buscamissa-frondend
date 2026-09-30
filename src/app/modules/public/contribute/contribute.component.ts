import { finalize } from "rxjs/operators";
import { Component, OnInit, inject } from "@angular/core";
import { PrimeNgModule } from "../../../shared/primeng.module";
import { ContributeService } from "../../../core/services/contribute.service";
import { NgFor } from "@angular/common";
import { MetricasService, PaginaMetrica } from "../../../core/services/metricas.service";

@Component({
  selector: "app-contribute",
  imports: [PrimeNgModule, NgFor],
  templateUrl: "./contribute.component.html",
  styleUrl: "./contribute.component.scss",
})
export class ContributeComponent implements OnInit {
  private readonly _contribute = inject(ContributeService);
  private readonly _metricas = inject(MetricasService);
  public contribuitors: any[] = [];

  constructor() {
    this._contribute.getContributors().subscribe({
      next: (res) => {
        this.contribuitors = res;
      },
    });
  }

  ngOnInit(): void {
    this._metricas.registrarVisualizacaoPagina(PaginaMetrica.Contribuir);
  }
}
