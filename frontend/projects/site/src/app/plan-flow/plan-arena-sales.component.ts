import { Component, OnDestroy } from '@angular/core';
import { RouterLink } from '@angular/router';

import { RevealDirective } from '../landing/ui/reveal.directive';
import { LandingHeaderComponent } from '../landing/landing-header.component';

@Component({
  standalone: true,
  imports: [RouterLink, RevealDirective, LandingHeaderComponent],
  templateUrl: './plan-arena-sales.component.html',
  styleUrl: './plan-arena-sales.component.scss',
})
export class PlanArenaSalesComponent implements OnDestroy {
  private static readonly X_VAR = '--x';
  private static readonly Y_VAR = '--y';

  onMouseMove(event: MouseEvent): void {
    const x = (event.clientX / window.innerWidth) * 100;
    const y = (event.clientY / window.innerHeight) * 100;
    const root = document.documentElement;
    root.style.setProperty(PlanArenaSalesComponent.X_VAR, `${x}%`);
    root.style.setProperty(PlanArenaSalesComponent.Y_VAR, `${y}%`);
  }

  ngOnDestroy(): void {
    const root = document.documentElement;
    root.style.removeProperty(PlanArenaSalesComponent.X_VAR);
    root.style.removeProperty(PlanArenaSalesComponent.Y_VAR);
  }
}
