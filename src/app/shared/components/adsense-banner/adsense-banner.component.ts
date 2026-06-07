import { Component, AfterViewInit } from '@angular/core';

declare global {
  interface Window {
    adsbygoogle: any[];
  }
}

@Component({
  selector: 'app-adsense-banner',
  templateUrl: './adsense-banner.component.html',
})
export class AdsenseBannerComponent implements AfterViewInit {
  ngAfterViewInit(): void {
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (e) {
      console.error('Adsense error:', e);
    }
  }
}
