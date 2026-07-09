import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

/** Links internos "Missas em outras cidades" — SEO/navegação (extraído do CityComponent — auditoria 2.x). */
@Component({
  selector: 'app-city-outras',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './city-outras.component.html',
  styleUrls: ['./city-outras.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CityOutrasComponent {
  @Input({ required: true }) cidades: { nome: string; uf: string; slug: string }[] = [];
}
