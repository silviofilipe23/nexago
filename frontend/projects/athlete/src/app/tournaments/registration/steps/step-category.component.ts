import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';

import { TournamentRegistrationService } from '../tournament-registration.service';
import type { RegistrationCategory } from '../registration.models';

@Component({
  selector: 'app-step-category',
  standalone: true,
  templateUrl: './step-category.component.html',
  styleUrl: './step-category.component.scss',
})
export class StepCategoryComponent {
  private readonly reg = inject(TournamentRegistrationService);

  protected readonly tournament = toSignal(this.reg.tournament$, { initialValue: null });
  protected readonly categories = toSignal(this.reg.categories$, { initialValue: [] });

  protected pick(c: RegistrationCategory): void {
    this.reg.selectCategory(c);
  }

  protected spotsRatio(c: RegistrationCategory): number {
    return c.spotsTotal > 0 ? Math.round((c.spotsLeft / c.spotsTotal) * 100) : 0;
  }

  protected isUrgent(c: RegistrationCategory): boolean {
    return c.spotsLeft <= 4;
  }
}
