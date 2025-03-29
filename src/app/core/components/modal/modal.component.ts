import { Component, EventEmitter, Input, Output } from '@angular/core';
import { PrimeNgModule } from '../../shared/primeng.module';

@Component({
  selector: 'app-modal',
  imports: [PrimeNgModule],
  templateUrl: './modal.component.html',
  styleUrl: './modal.component.scss'
})
export class ModalComponent {
  @Input() visible: boolean = false;
  @Input() header: string = '';
  @Input() closable: boolean = true;
  @Input() dismissableMask: boolean = true;
  @Input() styleClass: string = '';
  @Input() contentStyle: any = {};

  @Output() visibleChange: EventEmitter<boolean> = new EventEmitter<boolean>();
  @Output() onHide: EventEmitter<void> = new EventEmitter<void>();
  @Output() onShow: EventEmitter<void> = new EventEmitter<void>();

  closeModal(): void {
    this.visible = false;
    this.visibleChange.emit(this.visible);
    this.onHide.emit();
  }

  showModal(): void {
    this.visible = true;
    this.visibleChange.emit(this.visible);
    this.onShow.emit();
  }
}
