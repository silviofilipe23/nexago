import { Component, inject, OnInit } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';

import { TournamentRegistrationService } from '../tournament-registration.service';

@Component({
  selector: 'app-step-payment',
  standalone: true,
  templateUrl: './step-payment.component.html',
  styleUrl: './step-payment.component.scss',
})
export class StepPaymentComponent implements OnInit {
  private readonly reg = inject(TournamentRegistrationService);

  protected readonly loading = toSignal(this.reg.paymentLoading$, { initialValue: false });
  protected readonly status = toSignal(this.reg.registrationStatus$, { initialValue: 'idle' });
  protected readonly paymentOption = toSignal(this.reg.paymentOption$, { initialValue: null });
  protected readonly category = toSignal(this.reg.selectedCategory$, { initialValue: null });

  ngOnInit(): void {
    const st = this.reg.registrationStatus$.value;
    const loading = this.reg.paymentLoading$.value;
    if (loading || st === 'pending') {
      return;
    }
    if (st === 'idle' || st === 'rejected') {
      this.reg.runPaymentSimulation();
    }
  }

  protected retry(): void {
    this.reg.retryPayment();
    this.reg.runPaymentSimulation();
  }

  protected formatMoney(n: number): string {
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  }

  protected chargeLabel(): string {
    const c = this.category();
    const opt = this.paymentOption();
    if (!c || !opt) return '—';
    const total = c.priceReais;
    const half = Math.max(1, Math.round(total / 2));
    return this.formatMoney(opt === 'full' ? total : half);
  }
}
