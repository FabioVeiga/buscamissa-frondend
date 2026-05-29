import { Component, inject, OnInit } from "@angular/core";
import { RouterOutlet, Router, NavigationEnd, ActivatedRoute } from "@angular/router";
import { filter, map } from "rxjs/operators";
import { SeoService } from "./core/services/seo.service";

@Component({
  selector: "app-root",
  imports: [RouterOutlet],
  template: "<router-outlet>",
})
export class AppComponent implements OnInit {
  private _router = inject(Router);
  private _activatedRoute = inject(ActivatedRoute);
  private _seo = inject(SeoService);

  ngOnInit(): void {
    this._router.events.pipe(
      filter(e => e instanceof NavigationEnd),
      map(() => {
        let route = this._activatedRoute;
        while (route.firstChild) route = route.firstChild;
        return route.snapshot.data;
      })
    ).subscribe(data => {
      if (data['title']) {
        this._seo.update({
          title: data['title'],
          description: data['description'],
          canonical: data['canonical'],
        });
      }
    });
  }
}
