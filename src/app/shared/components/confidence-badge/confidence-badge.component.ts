import { Component, Input, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Mass } from '../../../core/interfaces/church.interface';
import { ConfidenceLevel } from '../../models/mass-card.model';
import { getConfidenceLevel } from '../../utils/mass-time.utils';

@Component({
  selector: 'app-confidence-badge',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './confidence-badge.component.html',
  styleUrl: './confidence-badge.component.scss',
})
export class ConfidenceBadgeComponent implements OnChanges {
  @Input({ required: true }) mass!: Mass;

  level: ConfidenceLevel = 'unverified';

  ngOnChanges(): void {
    this.level = getConfidenceLevel(this.mass);
  }
}
