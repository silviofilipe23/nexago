import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { formatCentsBRL } from '../data/cashback-model';
import { CashbackService } from '../data/cashback.service';

/** Card "Meu cashback" no topo da coluna lateral do painel — não é KPI (o grid de KPIs tem 4
 *  colunas) nem item do bottom nav. Só aparece com o recurso ligado e algum saldo
 *  (`CashbackService.visible`). `display: contents` no host: quando o card some, o elemento
 *  vazio não ocupa um `gap` da coluna. */
@Component({
  selector: 'app-cashback-painel-card',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (cashback.visible()) {
      <a class="cpc-card" routerLink="/cashback">
        <span class="cpc-kicker">Meu cashback</span>
        <strong class="cpc-total">{{ totalLabel() }} <span class="cpc-total-suffix">de cashback</span></strong>
        <span class="cpc-detail">{{ detailLabel() }}</span>
        <span class="cpc-cta">Ver extrato</span>
      </a>
    }
  `,
  styles: `
    :host {
      display: contents;
    }

    .cpc-card {
      position: relative;
      overflow: hidden;
      flex-shrink: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 18px 18px 18px 22px;
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-5);
      color: inherit;
      text-decoration: none;
      transition: border-color var(--nx-d-fast) var(--nx-ease-out);
    }

    .cpc-card::before {
      content: '';
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 3px;
      background: linear-gradient(180deg, var(--nx-orange-500), transparent);
    }

    .cpc-card:hover,
    .cpc-card:focus-visible {
      border-color: var(--nx-line-strong);
    }

    .cpc-kicker {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--nx-orange-500);
    }

    .cpc-total {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 22px;
      letter-spacing: -0.02em;
      color: var(--nx-text);
    }

    .cpc-total-suffix {
      font-size: 13px;
      font-weight: 600;
      color: var(--nx-text-mute);
    }

    .cpc-detail {
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      color: var(--nx-text-mute);
    }

    .cpc-cta {
      margin-top: 6px;
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 12.5px;
      color: var(--nx-orange-500);
    }
  `,
})
export class CashbackPainelCardComponent {
  protected readonly cashback = inject(CashbackService);

  /** "R$ 12,40 de cashback": disponível + pendente (o card só aparece com algum dos dois). */
  protected readonly totalLabel = computed(() => {
    const w = this.cashback.wallet();
    return formatCentsBRL(w.availableCents + w.pendingCents);
  });

  protected readonly detailLabel = computed(() => {
    const w = this.cashback.wallet();
    const parts = [`${formatCentsBRL(w.availableCents)} disponível`];
    if (w.pendingCents > 0) parts.push(`${formatCentsBRL(w.pendingCents)} pendente`);
    return parts.join(' · ');
  });
}
