import { Component, effect, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';

import type { PaymentInstallmentChoice } from '../registration.models';
import { TournamentRegistrationService } from '../tournament-registration.service';

@Component({
  selector: 'app-step-confirmation',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './step-confirmation.component.html',
  styleUrl: './step-confirmation.component.scss',
})
export class StepConfirmationComponent {
  private readonly reg = inject(TournamentRegistrationService);
  private readonly fb = inject(FormBuilder);

  protected readonly tournament = toSignal(this.reg.tournament$, { initialValue: null });
  protected readonly category = toSignal(this.reg.selectedCategory$, { initialValue: null });
  protected readonly partner = toSignal(this.reg.selectedPartner$, { initialValue: null });
  private readonly paymentFromService = toSignal(this.reg.paymentOption$, { initialValue: null });

  protected readonly form = this.fb.nonNullable.group({
    installment: this.fb.nonNullable.control<PaymentInstallmentChoice | null>(null, {
      validators: [Validators.required],
    }),
  });

  constructor() {
    effect(() => {
      const o = this.paymentFromService();
      if (o) {
        this.form.patchValue({ installment: o }, { emitEvent: false });
      }
    });

    this.form.controls.installment.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((v) => {
        if (v) {
          this.reg.setPaymentOption(v);
        }
      });
  }

  protected totalReais(): number {
    return this.category()?.priceReais ?? 0;
  }

  protected halfReais(): number {
    const t = this.totalReais();
    return Math.max(1, Math.round(t / 2));
  }

  protected formatMoney(n: number): string {
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  }

  protected guarantee(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.controls.installment.value;
    if (v) {
      this.reg.setPaymentOption(v);
    }
    this.reg.confirmAndGoToPayment();
  }
}
