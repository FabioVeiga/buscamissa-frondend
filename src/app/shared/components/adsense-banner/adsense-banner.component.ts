import { Component, AfterViewInit, inject } from '@angular/core';
import { LoggerService } from '../../../core/services/logger.service';

declare global {
  interface Window {
    adsbygoogle: any[];
  }
}

@Component({
  selector: 'app-adsense-banner',
  templateUrl: './adsense-banner.component.html',
  styleUrls: ['./adsense-banner.component.scss'],
})
export class AdsenseBannerComponent implements AfterViewInit {
  private logger = inject(LoggerService);

  ngAfterViewInit(): void {
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (e) {
      this.logger.logError(e, 'adsense');
    }
  }
}
