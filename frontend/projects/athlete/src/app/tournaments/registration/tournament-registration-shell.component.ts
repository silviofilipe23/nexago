import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { animate, style, transition, trigger } from '@angular/animations';
import { map } from 'rxjs';

import { MOCK_DISCOVERY_TOURNAMENTS } from '../tournament-discovery.mock';
import type { DiscoveryTournament } from '../tournament-discovery.models';
import { getTournamentDetailExtra } from '../tournament-detail.mock';
import { TournamentRegistrationService } from './tournament-registration.service';
import type { RegistrationStep } from './registration.models';
import { StepCategoryComponent } from './steps/step-category.component';
import { StepConfirmationComponent } from './steps/step-confirmation.component';
import { StepPartnerComponent } from './steps/step-partner.component';
import { StepPaymentComponent } from './steps/step-payment.component';
import { StepSuccessComponent } from './steps/step-success.component';

@Component({
  selector: 'app-tournament-registration-shell',
  standalone: true,
  imports: [
    RouterLink,
    StepCategoryComponent,
    StepPartnerComponent,
    StepConfirmationComponent,
    StepPaymentComponent,
    StepSuccessComponent,
  ],
  templateUrl: './tournament-registration-shell.component.html',
  styleUrl: './tournament-registration-shell.component.scss',
  providers: [TournamentRegistrationService],
  animations: [
    trigger('trgStepFade', [
      transition('* => *', [
        style({ opacity: 0, transform: 'translateY(14px)' }),
        animate(
          '360ms cubic-bezier(0.22, 1, 0.36, 1)',
          style({ opacity: 1, transform: 'translateY(0)' }),
        ),
      ]),
    ]),
  ],
})
export class TournamentRegistrationShellComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly reg = inject(TournamentRegistrationService);
  private readonly destroyRef = inject(DestroyRef);

  private lastInitKey = '';

  protected readonly id = toSignal(
    this.route.paramMap.pipe(map((p) => p.get('id') ?? '')),
    { initialValue: '' },
  );

  protected readonly preCategoryId = toSignal(
    this.route.queryParamMap.pipe(map((q) => q.get('categoria'))),
    { initialValue: null },
  );

  protected readonly step = toSignal(this.reg.currentStep$, {
    initialValue: 'category' as RegistrationStep,
  });

  protected readonly tournament = toSignal(this.reg.tournament$, { initialValue: null });
  protected readonly displayEnrolled = toSignal(this.reg.displayEnrolled$, { initialValue: 0 });
  protected readonly categorySpots = toSignal(this.reg.categorySpotsDisplay$, { initialValue: null });
  protected readonly selectedCategory = toSignal(this.reg.selectedCategory$, { initialValue: null });

  protected readonly progressLabels = ['Categoria', 'Dupla', 'Confirmação', 'Pagamento'] as const;

  protected readonly progressWidthPct = computed(() => {
    const s = this.step();
    const map: Record<RegistrationStep, number> = {
      category: 25,
      partner: 50,
      confirmation: 75,
      payment: 100,
      success: 100,
    };
    return map[s];
  });

  protected readonly activeProgressIndex = computed(() => {
    const s = this.step();
    const order: RegistrationStep[] = ['category', 'partner', 'confirmation', 'payment', 'success'];
    const i = order.indexOf(s);
    return Math.min(Math.max(i, 0), 3);
  });

  protected readonly listing = computed((): DiscoveryTournament | null => {
    const id = this.id();
    if (!id) return null;
    return MOCK_DISCOVERY_TOURNAMENTS.find((t) => t.id === id) ?? null;
  });

  constructor() {
    effect(() => {
      const id = this.id();
      const catQ = this.preCategoryId();
      if (!id) {
        return;
      }
      const listing = MOCK_DISCOVERY_TOURNAMENTS.find((t) => t.id === id);
      if (!listing) {
        return;
      }
      const key = `${id}|${catQ ?? ''}`;
      if (key === this.lastInitKey) {
        return;
      }
      this.lastInitKey = key;
      const extra = getTournamentDetailExtra(id, listing);
      untracked(() => {
        this.reg.init(id, listing, extra.categories, { preselectCategoryId: catQ });
      });
    });

    this.destroyRef.onDestroy(() => this.reg.destroy());
  }

  protected back(): void {
    this.reg.backStep();
  }

  protected readonly showBack = computed(() => {
    const s = this.step();
    return s !== 'category' && s !== 'success';
  });
}
