import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { LandingHeaderComponent } from '../landing/landing-header.component';
import { RevealDirective } from '../landing/ui/reveal.directive';

@Component({
  standalone: true,
  imports: [RouterLink, RevealDirective, LandingHeaderComponent],
  templateUrl: './plan-organizer-onboarding.component.html',
  styleUrl: './plan-organizer-onboarding.component.scss',
})
export class PlanOrganizerOnboardingComponent {
  onMouseMove(event: MouseEvent): void {
    const el = event.currentTarget as HTMLElement | null;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * 100;
    const y = ((event.clientY - rect.top) / Math.max(rect.height, 1)) * 100;
    el.style.setProperty('--mx', `${x}%`);
    el.style.setProperty('--my', `${y}%`);
  }
}
