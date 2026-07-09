import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

/** FAQ da página de cidade (extraído do CityComponent — auditoria 2.x). */
@Component({
  selector: 'app-city-faq',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './city-faq.component.html',
  styleUrls: ['./city-faq.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CityFaqComponent {
  @Input({ required: true }) faqs: { pergunta: string; resposta: string }[] = [];
}
