import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { PrimeNgModule } from '../../../shared/primeng.module';

@Component({
  selector: 'app-footer-home',
  imports: [RouterModule, PrimeNgModule],
  templateUrl: './footer.component.html',
  styleUrl: './footer.component.scss'
})
export class FooterHomeComponent {

}
