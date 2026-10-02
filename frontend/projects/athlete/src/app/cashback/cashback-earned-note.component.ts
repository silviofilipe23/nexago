import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { formatCentsBRL, type CashbackLot } from '../data/cashback-model';
import { CashbackService } from '../data/cashback.service';

/** Nota de cashback na tela de sucesso do pagamento. Ouve `lots/{paymentId}` enquanto a tela
 *  está aberta — o lote nasce logo depois do webhook e pode chegar um instante depois da tela.
 *  Lote pendente → "+R$ X de cashback pendente"; sem lote e recurso ligado → nota genérica;
 *  recurso desligado e sem lote → nada. */
@Component({
  selector: 'app-cashback-earned-note',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (earnedLabel(); as earned) {
      <a class="cen-note cen-note--earned" routerLink="/cashback">{{ earned }}</a>
    } @else if (showGeneric()) {
      <p class="cen-note">Pagamentos pelo app geram cashback — veja em <a routerLink="/cashback">Meu cashback</a></p>
    }
  `,
  styles: `
    :host {
      display: block;
    }

    .cen-note {
      display: block;
      margin: 0;
      padding: 10px 14px;
      border-radius: var(--nx-r-2);
      border: 1px solid var(--nx-line);
      background: var(--nx-surface-1);
      font-family: var(--nx-font-ui);
      font-size: 13px;
      line-height: 1.45;
      color: var(--nx-text-mute);
      text-align: center;
    }

    .cen-note a {
      color: var(--nx-orange-500);
      font-weight: 600;
      text-decoration: none;
    }

    .cen-note--earned {
      border-color: rgba(244, 197, 67, 0.32);
      background: rgba(244, 197, 67, 0.08);
      color: var(--nx-pending);
      font-weight: 600;
      text-decoration: none;
    }
  `,
})
export class CashbackEarnedNoteComponent {
  /** Id da cobrança no Asaas = id do lote. `null` (reserva dividida, link antigo) → só a genérica. */
  readonly paymentId = input<string | null>(null);

  private readonly cashback = inject(CashbackService);
  private readonly lot = signal<CashbackLot | null>(null);

  protected readonly earnedLabel = computed(() => {
    const lot = this.lot();
    return lot && lot.status === 'pending' && lot.earnedCents > 0
      ? `+${formatCentsBRL(lot.earnedCents)} de cashback pendente · libera depois do jogo`
      : null;
  });

  protected readonly showGeneric = computed(() => this.cashback.config().enabled);

  constructor() {
    effect((onCleanup) => {
      const paymentId = this.paymentId();
      this.lot.set(null);
      if (!paymentId) return;
      const stop = this.cashback.watchLot(paymentId, (lot) => this.lot.set(lot));
      onCleanup(stop);
    });
  }
}
