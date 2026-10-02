import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { formatCentsBRL, formatShortDate, groupLedgerByMonth } from '../data/cashback-model';
import { CashbackService } from '../data/cashback.service';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';
import { NxPageLoadingComponent } from '../shared/loading/nx-page-loading.component';
import { cashbackEmptyText, cashbackHowItWorks } from './cashback-copy';

/** "Meu cashback": saldo, "Como funciona" (regulamento) e extrato por mês. Abre mesmo com o
 *  recurso desligado — o saldo já ganho continua visível. Sem item de menu: a entrada é o card
 *  do painel e o `webUrl` dos pushes. */
@Component({
  selector: 'app-athlete-cashback',
  standalone: true,
  imports: [AtPanelShellComponent, NxPageLoadingComponent],
  templateUrl: './athlete-cashback.component.html',
  styleUrl: './athlete-cashback.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AthleteCashbackComponent {
  private readonly auth = inject(AuthService);
  protected readonly cashback = inject(CashbackService);

  protected readonly accountLabel = computed(() => this.auth.user()?.displayName?.trim() || 'Atleta');
  protected readonly loading = computed(() => !this.cashback.walletLoaded());
  protected readonly availableLabel = computed(() => formatCentsBRL(this.cashback.wallet().availableCents));
  protected readonly pendingLabel = computed(() => formatCentsBRL(this.cashback.wallet().pendingCents));
  protected readonly heldLabel = computed(() => {
    const held = this.cashback.wallet().heldCents;
    return held > 0 ? formatCentsBRL(held) : null;
  });
  protected readonly expiryLabel = computed(() => {
    const w = this.cashback.wallet();
    if (!w.nextExpiryAt || w.nextExpiryCents <= 0) return null;
    return `${formatCentsBRL(w.nextExpiryCents)} vencem em ${formatShortDate(w.nextExpiryAt)}`;
  });
  protected readonly howItWorks = computed(() => cashbackHowItWorks(this.cashback.config()));
  protected readonly emptyText = computed(() => cashbackEmptyText(this.cashback.config()));
  protected readonly months = computed(() => groupLedgerByMonth(this.cashback.ledger()));
}
