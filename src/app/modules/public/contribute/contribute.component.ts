import { finalize } from "rxjs/operators";
import { Component, inject } from "@angular/core";
import { PrimeNgModule } from "../../../shared/primeng.module";
import { ContributeService } from "../../../core/services/contribute.service";
import { NgFor } from "@angular/common";

@Component({
  selector: "app-contribute",
  imports: [PrimeNgModule, NgFor],
  templateUrl: "./contribute.component.html",
  styleUrl: "./contribute.component.scss",
})
export class ContributeComponent {
  private readonly _contribute = inject(ContributeService);
  public contribuitors: any[] = [];

  constructor() {
    this._contribute.getContributors().subscribe({
      next: (res) => {
        this.contribuitors = res;
      },
    });
  }
}
