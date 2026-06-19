import { Component, Input, OnChanges } from '@angular/core';
import { formatDistance } from '../../utils/mass-time.utils';

@Component({
  selector: 'app-distance-chip',
  standalone: true,
  imports: [],
  templateUrl: './distance-chip.component.html',
  styleUrl: './distance-chip.component.scss',
})
export class DistanceChipComponent implements OnChanges {
  @Input() meters?: number | null;

  formatted = '';

  ngOnChanges(): void {
    this.formatted = this.meters != null ? formatDistance(this.meters) : '';
  }
}
