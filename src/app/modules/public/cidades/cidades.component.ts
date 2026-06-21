import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ChurchesService } from '../../../core/services/churches.service';
import { STATES } from '../../../core/constants/states';

interface CidadeItem { nome: string; slug: string; }
interface EstadoItem { sigla: string; nome: string; cidades: CidadeItem[]; expandido: boolean; }

@Component({
  selector: 'app-cidades',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './cidades.component.html',
  styleUrl: './cidades.component.scss',
})
export class CidadesComponent implements OnInit {
  private _church = inject(ChurchesService);

  isLoading = true;
  busca = '';
  estados: EstadoItem[] = [];

  // Cores por estado (sigla → classe CSS)
  readonly estadoCores: Record<string, string> = {
    SP: 'badge--sp', MG: 'badge--mg', RJ: 'badge--rj', PR: 'badge--pr',
    RS: 'badge--rs', SC: 'badge--sc', DF: 'badge--df', GO: 'badge--go',
    BA: 'badge--ba', CE: 'badge--ce', PE: 'badge--pe', PA: 'badge--pa',
  };

  get totalCidades(): number {
    return this.estados.reduce((s, e) => s + e.cidades.length, 0);
  }

  get estadosFiltrados(): EstadoItem[] {
    const q = this.normalizar(this.busca);
    if (!q) return this.estados;
    return this.estados
      .map(e => ({
        ...e,
        expandido: true,
        cidades: e.cidades.filter(c => this.normalizar(c.nome).includes(q)),
      }))
      .filter(e => this.normalizar(e.nome).includes(q) || e.cidades.length > 0);
  }

  ngOnInit(): void {
    this._church.addressRange().subscribe({
      next: ({ data }: any) => {
        this.estados = Object.entries(data)
          .map(([uf, cities]: [string, any]) => ({
            sigla: uf,
            nome: STATES.find(s => s.sigla === uf)?.nome ?? uf,
            cidades: Object.keys(cities)
              .map(nome => ({ nome, slug: this.slugify(nome) }))
              .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
            expandido: false,
          }))
          .sort((a, b) => b.cidades.length - a.cidades.length);

        if (this.estados.length) this.estados[0].expandido = true;
        this.isLoading = false;
      },
      error: () => { this.isLoading = false; },
    });
  }

  toggleEstado(e: EstadoItem): void { e.expandido = !e.expandido; }

  badgeClass(sigla: string): string {
    return this.estadoCores[sigla] ?? 'badge--default';
  }

  slugify(s: string): string {
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  }

  normalizar(s: string): string {
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  }
}
