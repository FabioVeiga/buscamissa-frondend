import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { PrimeNgModule } from '../../../shared/primeng.module';
import { SeoService } from '../../../core/services/seo.service';
import { getCountdownLabel } from '../../../shared/utils/mass-time.utils';
import { getMissaAgoraUrgency } from '../../../shared/utils/mass-time.utils';

interface IgrejaFavorita {
  id: number;
  nome: string;
  uf: string;
  cidadeSlug: string;
  slug: string;
  diaSemana?: number;
  horario?: string;
  proximaMissaLabel?: string;
}

@Component({
  selector: 'app-minhas-igrejas',
  standalone: true,
  imports: [CommonModule, RouterModule, PrimeNgModule],
  providers: [MessageService],
  templateUrl: './minhas-igrejas.component.html',
  styleUrl: './minhas-igrejas.component.scss',
})
export class MinhasIgrejasComponent implements OnInit {
  private _seo = inject(SeoService);
  private _router = inject(Router);
  private _toast = inject(MessageService);

  igrejas: IgrejaFavorita[] = [];

  ngOnInit(): void {
    this._seo.update({
      title: 'Minhas Igrejas | BuscaMissa',
      description: 'Veja todas as suas igrejas favoritas e horários de missa.',
      canonical: 'https://buscamissa.com.br/minhas-igrejas',
    });
    this._carregarIgrejas();
  }

  private _carregarIgrejas(): void {
    const raw = localStorage.getItem('buscamissa_favoritas');
    if (!raw) {
      this.igrejas = [];
      return;
    }
    try {
      const saved = JSON.parse(raw);
      if (Array.isArray(saved)) {
        this.igrejas = saved.map((f: any) => ({
          ...f,
          proximaMissaLabel: f.diaSemana != null && f.horario
            ? getCountdownLabel(f.diaSemana, f.horario)
            : undefined,
        }));
      }
    } catch {
      this.igrejas = [];
    }
  }

  getUrgency(igreja: IgrejaFavorita) {
    if (igreja.diaSemana == null) return null;
    return getMissaAgoraUrgency(igreja.diaSemana, igreja.horario ?? '');
  }

  removerIgreja(id: number, event: Event): void {
    event.preventDefault();
    event.stopPropagation();

    const igrejas = JSON.parse(localStorage.getItem('buscamissa_favoritas') || '[]');
    const filtradas = igrejas.filter((i: any) => i.id !== id);
    localStorage.setItem('buscamissa_favoritas', JSON.stringify(filtradas));

    this._carregarIgrejas();
    this._toast.add({
      severity: 'success',
      summary: 'Removida',
      detail: 'Igreja removida dos favoritos.',
    });
  }

  irParaIgreja(igreja: IgrejaFavorita): void {
    this._router.navigate(['/paroquia', igreja.uf.toLowerCase(), igreja.cidadeSlug, igreja.slug]);
  }
}
