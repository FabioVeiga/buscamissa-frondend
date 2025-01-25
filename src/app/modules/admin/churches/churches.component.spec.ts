import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ChurchesComponent } from './churches.component';

describe('ChurchesComponent', () => {
  let component: ChurchesComponent;
  let fixture: ComponentFixture<ChurchesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChurchesComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ChurchesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
