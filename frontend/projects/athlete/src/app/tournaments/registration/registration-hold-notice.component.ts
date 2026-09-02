import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { interval } from 'rxjs';

import {
  DEFAULT_REGISTRATION_HOLD_MINUTES,
  registrationHoldCountdownView,
} from './registration-hold';

/** Countdown da vaga reservada — espelha `RegistrationWizardNotice` do app Flutter. */
@Component({
  selector: 'app-registration-hold-notice',
  standalone: true,
  templateUrl: './registration-hold-notice.component.html',
  styleUrl: './registration-hold-notice.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegistrationHoldNoticeComponent {
  private readonly destroyRef = inject(DestroyRef);

  readonly holdExpiresAt = input.required<Date>();
  readonly holdMinutes = input<number>(DEFAULT_REGISTRATION_HOLD_MINUTES);

  private readonly nowMs = signal(Date.now());

  protected readonly view = computed(() =>
    registrationHoldCountdownView({
      holdExpiresAt: this.holdExpiresAt(),
      holdMinutes: this.holdMinutes(),
      now: new Date(this.nowMs()),
    }),
  );

  constructor() {
    interval(1000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.nowMs.set(Date.now()));
  }
}
