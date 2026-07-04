import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, NavigationEnd } from '@angular/router';
import { MessageService } from 'primeng/api';
import { PrimeNgModule } from '../../../shared/primeng.module';
import { SeoService } from '../../../core/services/seo.service';
import { ClarityService } from '../../../core/services/clarity.service';
import { getCountdownLabel } from '../../../shared/utils/mass-time.utils';
import { getMissaAgoraUrgency } from '../../../shared/utils/mass-time.utils';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import { FavoritesService, IgrejaFavorita } from '../../../core/services/favorites.service';

@Component({
  selector: 'app-minhas-igrejas',
  standalone: true,
  imports: [CommonModule, RouterModule, PrimeNgModule],
  providers: [MessageService],
  templateUrl: './minhas-igrejas.component.html',
  styleUrl: './minhas-igrejas.component.scss',
})
export class MinhasIgrejasComponent implements OnInit, OnDestroy {
  private _seo = inject(SeoService);
  private _router = inject(Router);
  private _toast = inject(MessageService);
  private _clarity = inject(ClarityService);
  private _favorites = inject(FavoritesService);

  igrejas: IgrejaFavorita[] = [];
  private _navSub: Subscription | null = null;

  ngOnInit(): void {
    this._seo.update({
      title: 'Minhas Igrejas | BuscaMissa',
      description: 'Veja todas as suas igrejas favoritas e horários de missa.',
      canonical: 'https://buscamissa.com.br/minhas-igrejas',
    });
    this._carregarIgrejas();
    this._clarity.track('favoritos_lista_aberta');

    this._navSub = this._router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe(() => this._carregarIgrejas());
  }

  ngOnDestroy(): void {
    this._navSub?.unsubscribe();
  }

  private _carregarIgrejas(): void {
    this.igrejas = this._favorites.listar().map((f) => ({
      ...f,
      proximaMissaLabel: f.diaSemana != null && f.horario
        ? getCountdownLabel(f.diaSemana, f.horario)
        : undefined,
    }));
  }

  getUrgency(igreja: IgrejaFavorita) {
    if (igreja.diaSemana == null) return null;
    return getMissaAgoraUrgency(igreja.diaSemana, igreja.horario ?? '');
  }

  removerIgreja(id: number, event: Event): void {
    event.preventDefault();
    event.stopPropagation();

    this._favorites.remover(id);

    this._clarity.track('favorito_removido', { igrejaId: String(id) });
    this._carregarIgrejas();
    this._toast.add({
      severity: 'success',
      summary: 'Removida',
      detail: 'Igreja removida dos favoritos.',
    });
  }

  irParaIgreja(igreja: IgrejaFavorita): void {
    this._clarity.track('favorito_clicado', { igrejaId: String(igreja.id) });
    this._router.navigate(['/paroquia', (igreja.uf ?? '').toLowerCase(), igreja.cidadeSlug, igreja.slug]);
  }
}
