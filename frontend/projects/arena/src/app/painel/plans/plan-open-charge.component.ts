import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { formatCentsBRL } from '../stock/product.model';
import type { ArenaPlanOpenCharge } from './subscription-repository';

/** `2026-12-12` → `12/12/2026` (vencimento do Asaas, sem fuso). */
function formatDayKey(dayKey: string): string {
  const [y, m, d] = dayKey.split('-');
  return y && m && d ? `${d}/${m}/${y}` : dayKey;
}

/** Mensalidade do plano em aberto: o Pix que a recorrência do Asaas gerou (QR + copia-e-cola)
 *  ou a fatura quando o cartão recusou. Sem isto a arena no Pix não tinha onde pagar a
 *  renovação e perdia o plano depois da carência. */
@Component({
  selector: 'ar-plan-open-charge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'open-charge', '[class.warn]': 'overdue()' },
  template: `
    <div class="head">
      <span class="title">{{ overdue() ? 'Mensalidade vencida' : 'Próxima mensalidade' }}</span>
      <span class="value">{{ value() }}</span>
    </div>
    <p class="line">{{ dueLine() }}</p>

    @if (hasPix()) {
      @if (showPix()) {
        @if (charge().qrCodeBase64; as img) {
          <img class="pix-qr" [src]="'data:image/png;base64,' + img" alt="QR code Pix da mensalidade" />
        }
        @if (charge().qrCode; as code) {
          <div class="pix-copy-row">
            <code class="pix-copy-code">{{ code }}</code>
            <button type="button" class="ar-mini-btn" (click)="copy(code)">{{ copied() ? 'Copiado' : 'Copiar' }}</button>
          </div>
        }
        <p class="line">O plano é renovado assim que o Pix for confirmado.</p>
      } @else {
        <button type="button" class="ar-mini-btn ar-mini-btn-primary" (click)="showPix.set(true)">Pagar com Pix</button>
      }
    } @else if (charge().invoiceUrl; as url) {
      <a class="ar-mini-btn ar-mini-btn-primary" [href]="url" target="_blank" rel="noopener">Pagar mensalidade</a>
    }
  `,
  styles: `
    :host {
      margin-top: 14px;
      padding: 14px;
      border-radius: var(--nx-r-2);
      border: 1px solid var(--nx-line);
      background: var(--nx-surface-1);
      display: flex;
      flex-direction: column;
      gap: 8px;
      align-items: flex-start;
    }

    :host(.warn) {
      border-color: var(--nx-pending);
    }

    .head {
      width: 100%;
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 12px;
    }

    .title {
      font-size: 13px;
      font-weight: 700;
      color: var(--nx-text);
    }

    :host(.warn) .title {
      color: var(--nx-pending);
    }

    .value {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 18px;
      color: var(--nx-text);
    }

    .line {
      font-size: 12.5px;
      color: var(--nx-text-dim);
      margin: 0;
    }

    .pix-qr {
      width: 200px;
      height: 200px;
      display: block;
      border-radius: var(--nx-r-2);
      border: 1px solid var(--nx-line);
      background: #fff;
    }

    .pix-copy-row {
      width: 100%;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .pix-copy-code {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 11px;
      color: var(--nx-text-dim);
      background: var(--nx-surface-2, var(--nx-surface-1));
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-1, 6px);
      padding: 7px 9px;
    }
  `,
})
export class PlanOpenChargeComponent {
  readonly charge = input.required<ArenaPlanOpenCharge>();

  protected readonly showPix = signal(false);
  protected readonly copied = signal(false);

  protected readonly overdue = computed(() => this.charge().status === 'OVERDUE');
  protected readonly hasPix = computed(() => !!(this.charge().qrCode || this.charge().qrCodeBase64));
  protected readonly value = computed(() => formatCentsBRL(this.charge().valueCents));
  protected readonly dueLine = computed(() => {
    const c = this.charge();
    const due = `${this.overdue() ? 'Venceu em' : 'Vence em'} ${formatDayKey(c.dueDate)}`;
    return this.overdue() && c.billingType === 'CREDIT_CARD' ? `${due} · o cartão foi recusado` : due;
  });

  protected async copy(code: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(code);
      this.copied.set(true);
    } catch {
      // clipboard indisponível — o código segue visível para copiar à mão.
    }
  }
}
