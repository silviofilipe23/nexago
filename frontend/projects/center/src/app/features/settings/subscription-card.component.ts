import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { formatDayKey, isValidDayKey } from '../../domain/dates';
import type { CenterSubscription } from '../../domain/models';
import { formatBRL } from '../../domain/money';

export const SUBSCRIPTION_STATUS: Record<CenterSubscription['status'], [string, string]> = {
  trial: ['Período de teste', 'blue'],
  active: ['Em dia', 'green'],
  past_due: ['Em atraso', 'red'],
  cancelled: ['Cancelada', 'dim'],
};

/**
 * Assinatura NexaGO do centro (contrato da plataforma, separado das mensalidades). Só leitura:
 * a cobrança da assinatura é feita pelo time NexaGO, fora do painel.
 */
@Component({
  selector: 'ct-subscription-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="ct-card">
      <div class="ct-card-head">
        <div class="ct-grow">
          <div class="ct-kick">Contrato da plataforma · separado das mensalidades</div>
          <div class="ct-card-title">Assinatura NexaGO</div>
        </div>
        @if (sub(); as s) {
          <span class="ct-pill" [class]="'ct-pill ' + status()[1]">{{ status()[0] }}</span>
        }
      </div>
      @if (sub(); as s) {
        <div class="ct-kv"><span>Plano</span><span>{{ s.plan }}</span></div>
        <div class="ct-kv mono"><span>Fatura em aberto</span><span>{{ openInvoice() }}</span></div>
        <div class="ct-kv"><span>Vencimento</span><span>{{ due() }}</span></div>
        @if (s.attempts) {
          <div class="ct-kv mono"><span>Tentativas de cobrança</span><span>{{ s.attempts }}</span></div>
        }
      } @else {
        <p class="ct-muted">Assinatura ainda não configurada. O time NexaGO libera o plano do centro na ativação.</p>
      }
      <p class="ct-dim note">
        A cobrança da assinatura é feita pelo time NexaGO, fora deste painel.
        @if (sub()?.status === 'past_due') {
          Ao regularizar, o centro volta a ficar ativo e as matrículas congeladas retomam do ponto em que pararam.
        }
      </p>
    </section>
  `,
  styles: `.note { margin: 14px 0 0; }`,
})
export class SubscriptionCardComponent {
  readonly sub = input<CenterSubscription | null>(null);

  protected readonly status = computed(() => SUBSCRIPTION_STATUS[this.sub()?.status ?? 'trial']);
  protected readonly openInvoice = computed(() => {
    const c = this.sub()?.openInvoiceCents;
    return c == null || c === 0 ? 'Nenhuma' : formatBRL(c);
  });
  protected readonly due = computed(() => {
    const d = this.sub()?.dueDate;
    return d && isValidDayKey(d) ? formatDayKey(d, true) : '—';
  });
}
