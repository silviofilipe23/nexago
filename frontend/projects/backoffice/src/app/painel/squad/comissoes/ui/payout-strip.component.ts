import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { IconComponent } from '../../../ui/icon.component';
import { brl, brlShort, dayMonthOfKey } from '../data/commission';

export type StripState = 'loading' | 'ready' | 'empty' | 'processing' | 'partial';

/** Faixa do próximo repasse: data, total, quem recebe e as duas ações. */
@Component({
  selector: 'bo-payout-strip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <section class="strip" [class.quiet]="state() === 'empty' || state() === 'loading'" aria-live="polite">
      <span class="ico" aria-hidden="true">
        @if (state() === 'processing') {
          <span class="bo-spinner"></span>
        } @else {
          <bo-icon name="calendar" [size]="20" [strokeWidth]="2" />
        }
      </span>
      <div class="text">
        @switch (state()) {
          @case ('loading') {
            <strong>Próximo repasse</strong>
            <span>Carregando…</span>
          }
          @case ('empty') {
            <strong>Nada a repassar em {{ date() }}</strong>
            <span>As próximas liberações aparecem aqui.</span>
          }
          @case ('processing') {
            <strong>Repasse de {{ date() }} · processando</strong>
            <span>Creditando carteiras… Aguarde antes de tentar de novo.</span>
          }
          @case ('partial') {
            <strong>Repasse de {{ date() }} · {{ failedCount() }} {{ failedCount() === 1 ? 'crédito falhou' : 'créditos falharam' }}</strong>
            <span>{{ brl(totalCents()) }} ainda para {{ count() }} {{ who() }}. Tentar de novo só refaz o que faltou.</span>
          }
          @default {
            <strong>Próximo repasse · {{ date() }}</strong>
            <span>{{ brlShort(totalCents()) }} para {{ count() }} {{ who() }} · crédito na carteira NexaGO de cada um</span>
          }
        }
      </div>
      <div class="actions">
        <button type="button" class="bo-mini-btn" [disabled]="state() === 'loading' || state() === 'processing'" (click)="review.emit()">
          Revisar lista
        </button>
        @if (canApprove()) {
          <button
            type="button"
            class="bo-mini-btn bo-mini-btn-primary"
            [disabled]="state() !== 'ready' && state() !== 'partial'"
            (click)="approve.emit()"
          >
            {{ state() === 'partial' ? 'Tentar de novo' : 'Aprovar repasse' }}
          </button>
        }
      </div>
    </section>
  `,
  styles: `
    .strip { display: flex; align-items: center; gap: 18px; padding: 18px 22px; border-radius: var(--nx-r-4); border: 1px solid rgba(255, 106, 26, 0.45); background: radial-gradient(120% 160% at 0% 50%, rgba(255, 106, 26, 0.16), rgba(255, 106, 26, 0.03) 60%), var(--nx-surface-0); box-shadow: 0 0 0 4px rgba(255, 106, 26, 0.06), 0 12px 40px rgba(255, 106, 26, 0.08); }
    .strip.quiet { border-color: var(--nx-line-strong); background: var(--nx-surface-0); box-shadow: none; }
    .ico { width: 46px; height: 46px; flex: none; display: grid; place-items: center; border-radius: var(--nx-r-3); background: var(--nx-orange-500); color: var(--nx-text-on-orange); }
    .quiet .ico { background: var(--nx-surface-2); color: var(--nx-text-mute); }
    .text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
    strong { font-family: var(--nx-font-display); font-weight: 700; font-size: 16px; letter-spacing: -0.01em; }
    .text span { font-size: 13px; color: var(--nx-text-mute); }
    .actions { display: flex; gap: 10px; flex: none; }
    .bo-mini-btn { height: 38px; padding: 0 16px; font-size: 13px; }
    .bo-spinner { width: 18px; height: 18px; border-width: 2px; }
    @media (max-width: 760px) {
      .strip { flex-wrap: wrap; }
      .actions { width: 100%; }
      .actions button { flex: 1; }
    }
  `,
})
export class PayoutStripComponent {
  readonly state = input.required<StripState>();
  readonly payoutDate = input<string | null>(null);
  readonly totalCents = input(0);
  readonly count = input(0);
  readonly failedCount = input(0);
  readonly canApprove = input(false);

  readonly review = output<void>();
  readonly approve = output<void>();

  protected readonly brl = brl;
  protected readonly brlShort = brlShort;
  protected readonly date = computed(() => {
    const d = this.payoutDate();
    return d ? dayMonthOfKey(d) : '';
  });
  protected readonly who = computed(() => (this.count() === 1 ? 'embaixador' : 'embaixadores'));
}
