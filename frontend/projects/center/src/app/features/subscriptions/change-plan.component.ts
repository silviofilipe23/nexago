import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { CenterContextService } from '../../core/center-context.service';
import { writeErrorMessage } from '../../data/actions/actor';
import { SubscriptionsActions, type ChangePlanResult } from '../../data/actions/subscriptions.actions';
import { CenterStore } from '../../data/center-store.service';
import { formatDayKey, todayKey } from '../../domain/dates';
import { formatBRL } from '../../domain/money';
import type { Subscription } from '../../domain/models';
import { IconComponent } from '../../ui/icon.component';
import { BannerComponent, ModalComponent } from '../../ui/kit';
import { invoiceTitle, planChangePreview, prorationFormula } from './subscription-view';

/** R4 — Mudar plano: agora com proporcional ou no próximo ciclo. */
@Component({
  selector: 'ct-change-plan',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ModalComponent, BannerComponent, IconComponent],
  template: `
    <ct-modal [kicker]="sub().payerName + ' · ' + sub().className" title="Mudar plano" [width]="580" (closed)="closed.emit()">
      @if (plans().length === 0) {
        <div class="ct-dim">Não há outro plano mensal ativo. Crie ou reative um plano em Planos.</div>
      } @else {
        <div class="ct-field">
          <label for="cp-plan">Novo plano</label>
          <select id="cp-plan" class="ct-input" [value]="planId()" (change)="planId.set(val($event))">
            @for (p of plans(); track p.id) {
              <option [value]="p.id" [selected]="p.id === planId()">{{ p.name }} · {{ formatBRL(p.priceCents) }}/mês</option>
            }
          </select>
        </div>

        @if (plan(); as p) {
          <div class="swap">
            <div class="side">
              <div class="ct-kick">Atual</div>
              <div class="nm">{{ sub().planName }}</div>
              <div class="ct-mono">{{ formatBRL(sub().priceCents) }}/mês</div>
            </div>
            <ct-icon name="chevron" [size]="16" class="arrow" />
            <div class="side new">
              <div class="ct-kick">Novo</div>
              <div class="nm">{{ p.name }}</div>
              <div class="ct-mono">{{ formatBRL(p.priceCents) }}/mês</div>
            </div>
          </div>

          <div>
            <div class="ct-kick" style="margin-bottom: 8px">Quando vale</div>
            <div class="opts">
              <button type="button" class="ct-option" [class.on]="when() === 'now'" [disabled]="nowBlocked()" (click)="when.set('now')">
                <strong>Agora, com proporcional</strong>
                <span>{{ pv()!.diffCents > 0 ? 'Cobra a diferença dos dias restantes' : 'Sem cobrança extra · não devolve diferença' }}</span>
              </button>
              <button type="button" class="ct-option" [class.on]="when() === 'next_cycle'" (click)="when.set('next_cycle')">
                <strong>No próximo ciclo</strong>
                <span>A partir de {{ formatDayKey(pv()!.nextFrom) }} · sem cobrança extra</span>
              </button>
            </div>
          </div>

          @if (pv(); as v) {
            <div class="ct-box">
              @if (when() === 'now') {
                <div class="ct-kv mono"><span>Dias restantes no ciclo</span><span>{{ v.days }} de {{ v.cycleDays }}</span></div>
                <div class="ct-kv mono"><span>Diferença proporcional</span><span>{{ formula() }}</span></div>
                <div class="ct-kv mono"><span>Cobrança agora</span><span>{{ formatBRL(v.cents) }}</span></div>
                <div class="ct-kv mono"><span>A partir de {{ formatDayKey(v.nowFrom) }}</span><span>{{ formatBRL(p.priceCents) }}/mês</span></div>
              } @else {
                <div class="ct-kv mono"><span>Cobrança agora</span><span>{{ formatBRL(0) }}</span></div>
                <div class="ct-kv mono"><span>Até {{ formatDayKey(v.nextFrom) }}</span><span>{{ formatBRL(sub().priceCents) }}/mês</span></div>
                <div class="ct-kv mono"><span>A partir de {{ formatDayKey(v.nextFrom) }}</span><span>{{ formatBRL(p.priceCents) }}/mês</span></div>
              }
            </div>
            @if (v.blockedByLate; as late) {
              <ct-banner tone="yellow" [inline]="true" [title]="invoiceTitle(late) + ' ainda está em aberto'">
                A mudança agora só é aceita depois que a cobrança de {{ formatBRL(late.amountCents) }} for paga. No próximo ciclo pode ser agendada já.
              </ct-banner>
            } @else if (v.blockedBySent; as sent) {
              <ct-banner tone="yellow" [inline]="true" [title]="invoiceTitle(sent) + ' já foi enviada ao aluno'">
                O link de {{ formatBRL(sent.amountCents) }} já saiu. Mude no próximo ciclo ou cancele essa cobrança no Financeiro antes.
              </ct-banner>
            }
          }
        }
      }

      @if (result(); as r) {
        <ct-banner tone="green" [inline]="true" title="Plano alterado">
          @if (r.when === 'next_cycle') {
            Vale a partir de {{ formatDayKey(r.effectiveFrom) }}.
          } @else if (r.chargedCents > 0) {
            Diferença de {{ formatBRL(r.chargedCents) }} cobrada{{ r.invoiceUrl ? ' · link enviado ao aluno' : ' · sem link online (baixa no Financeiro)' }}.
          } @else {
            Já está valendo · sem cobrança extra.
          }
        </ct-banner>
      }
      @if (error()) {
        <div class="ct-error-text">{{ error() }}</div>
      }

      <div footer>
        @if (result()) {
          <button type="button" class="ct-mini-btn ct-mini-btn-primary" (click)="closed.emit()">Fechar</button>
        } @else {
          <button type="button" class="ct-mini-btn" [disabled]="busy()" (click)="closed.emit()">Cancelar</button>
          <button type="button" class="ct-mini-btn ct-mini-btn-primary" [disabled]="!canSubmit()" (click)="submit()">{{ busy() ? 'Salvando…' : 'Confirmar mudança' }}</button>
        }
      </div>
    </ct-modal>
  `,
  styles: `
    .swap { display: grid; grid-template-columns: 1fr 28px 1fr; align-items: center; gap: 8px; }
    .side { padding: 12px; border-radius: var(--nx-r-3); background: var(--nx-surface-0); border: 1px solid var(--nx-line); min-width: 0; }
    .side.new { background: rgba(255,106,26,0.07); border-color: rgba(255,106,26,0.45); }
    .side.new .ct-kick { color: var(--nx-orange-400); }
    .nm { margin: 6px 0 2px; font-family: var(--nx-font-display); font-weight: 700; font-size: 13.5px; color: var(--nx-text); }
    .arrow { color: var(--nx-text-dim); justify-self: center; }
    .opts { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    @media (max-width: 560px) { .opts, .swap { grid-template-columns: 1fr; } .arrow { display: none; } }
  `,
})
export class ChangePlanComponent {
  readonly sub = input.required<Subscription>();
  readonly closed = output<void>();

  private readonly ctx = inject(CenterContextService);
  private readonly store = inject(CenterStore);
  private readonly actions = inject(SubscriptionsActions);

  protected readonly formatBRL = formatBRL;
  protected readonly formatDayKey = formatDayKey;
  protected readonly invoiceTitle = invoiceTitle;

  protected readonly today = computed(() => todayKey(this.ctx.center()?.timezone));
  protected readonly plans = computed(() =>
    this.store
      .plans()
      .filter((p) => p.type === 'monthly' && p.status === 'active' && p.id !== this.sub().planId)
      .sort((a, b) => a.priceCents - b.priceCents),
  );
  protected readonly planId = signal('');
  protected readonly when = signal<'now' | 'next_cycle'>('now');
  protected readonly plan = computed(() => this.plans().find((p) => p.id === this.planId()) ?? null);
  protected readonly pv = computed(() => {
    const p = this.plan();
    return p ? planChangePreview(this.sub(), p.priceCents, this.store.invoices(), this.today()) : null;
  });
  protected readonly nowBlocked = computed(() => !!this.pv()?.blockedByLate || !!this.pv()?.blockedBySent);
  protected readonly formula = computed(() => {
    const v = this.pv();
    const p = this.plan();
    return v && p ? prorationFormula(this.sub().priceCents, p.priceCents, v.days, v.cycleDays) : '';
  });

  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly result = signal<ChangePlanResult | null>(null);
  protected readonly canSubmit = computed(() => !!this.plan() && !this.busy() && !(this.when() === 'now' && this.nowBlocked()));

  constructor() {
    effect(() => {
      const list = this.plans();
      untracked(() => {
        if (!list.some((p) => p.id === this.planId())) {
          this.planId.set(list[0]?.id ?? '');
        }
      });
    });
    // "Agora" recusado pelo servidor: já abre em "próximo ciclo".
    effect(() => {
      if (this.nowBlocked()) {
        untracked(() => this.when.set('next_cycle'));
      }
    });
  }

  val(ev: Event): string {
    return (ev.target as HTMLSelectElement).value;
  }

  async submit(): Promise<void> {
    const p = this.plan();
    if (!p || !this.canSubmit()) {
      return;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      this.result.set(await this.actions.changePlan(this.sub(), p.id, this.when()));
    } catch (err) {
      this.error.set(writeErrorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }
}
