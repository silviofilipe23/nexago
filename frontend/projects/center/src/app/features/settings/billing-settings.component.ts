import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { CenterContextService } from '../../core/center-context.service';
import { CenterActions } from '../../data/actions/center.actions';
import { writeErrorMessage } from '../../data/actions/actor';
import { CenterStore } from '../../data/center-store.service';
import { dunningLadder, firstInvoiceCents } from '../../domain/billing';
import { formatDayKey, formatInstant, todayKey } from '../../domain/dates';
import { DEFAULT_BILLING, type CenterBilling } from '../../domain/models';
import { formatBRL } from '../../domain/money';
import { AuditTrailComponent, SegmentedComponent } from '../../ui/kit';
import { billingError, changedBilling } from './billing-fields';

const BLOCK_OPTIONS = [
  { value: '10', label: '10 dias' },
  { value: '20', label: '20 dias' },
  { value: '30', label: '30 dias' },
  { value: '0', label: 'Nunca' },
];

/** Configurações › Cobrança recorrente (protótipo R1). */
@Component({
  selector: 'ct-billing-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SegmentedComponent, AuditTrailComponent],
  template: `
    @if (draft(); as b) {
      <div class="ct-grid-aside">
        <section class="ct-card">
          <div class="ct-card-head">
            <div class="ct-grow">
              <div class="ct-kick">Vale para os próximos ciclos</div>
              <div class="ct-card-title">Como as mensalidades são cobradas</div>
            </div>
          </div>

          <div class="row">
            <div class="ct-grow">
              <div class="ct-disp">Formas de pagamento</div>
              <div class="ct-dim">A cada ciclo o aluno recebe no app o link da fatura · paga com Pix ou cartão</div>
            </div>
            <div class="methods">
              <span class="ct-pill green">Pix mensal</span>
              <span class="ct-pill dim" title="Depende da autorização do aluno no app">Cartão recorrente · em breve</span>
              <span class="ct-pill dim" title="Depende da autorização do aluno no app">Pix Automático · em breve</span>
            </div>
          </div>

          <div class="row">
            <div class="ct-grow">
              <div class="ct-disp">Dia de vencimento</div>
              <div class="ct-dim">
                {{ b.billingDayMode === 'fixed' ? 'Todos vencem no mesmo dia (1 a 28)' : 'Cada aluno vence no dia em que entrou (até 28)' }}
              </div>
            </div>
            <ct-segmented [options]="modeOptions" [value]="b.billingDayMode" [disabled]="!editable() || busy()" (valueChange)="set('billingDayMode', $event)" />
            @if (b.billingDayMode === 'fixed') {
              <label class="num">
                <span class="ct-mono">dia</span>
                <input class="ct-input mono" type="number" min="1" max="28" aria-label="Dia de vencimento" [value]="b.billingDay" [disabled]="!editable() || busy()" (input)="setNumber('billingDay', $event)" />
              </label>
            }
          </div>

          <div class="row" [class.off]="b.billingDayMode === 'enrollment'">
            <div class="ct-grow">
              <div class="ct-disp">Primeiro mês</div>
              <div class="ct-dim">
                {{ b.billingDayMode === 'enrollment' ? 'Vencimento na data da matrícula: o 1º mês é sempre cheio' : 'Entrou no meio do mês: cobra só os dias até o vencimento' }}
              </div>
            </div>
            <ct-segmented [options]="firstOptions" [value]="b.firstMonth" [disabled]="!editable() || busy() || b.billingDayMode === 'enrollment'" (valueChange)="set('firstMonth', $event)" />
          </div>

          <div class="row">
            <div class="ct-grow">
              <div class="ct-disp">Multa e juros por atraso</div>
              <div class="ct-dim">Multa de 2% + juros de 1% ao mês, somados pelo provedor no pagamento</div>
            </div>
            <ct-segmented [options]="feeOptions" [value]="b.lateFees ? 'true' : 'false'" [disabled]="!editable() || busy()" (valueChange)="set('lateFees', $event)" />
          </div>

          <div class="row">
            <div class="ct-grow">
              <div class="ct-disp">Atraso bloqueia check-in</div>
              <div class="ct-dim">{{ b.blockAfterDays ? 'Depois de ' + b.blockAfterDays + ' dias sem pagamento · a chamada mostra “pendência”' : 'O check-in nunca é bloqueado por atraso' }}</div>
            </div>
            <ct-segmented [options]="blockOptions()" [value]="'' + b.blockAfterDays" [disabled]="!editable() || busy()" (valueChange)="set('blockAfterDays', $event)" />
          </div>

          <div class="row">
            <div class="ct-grow">
              <div class="ct-disp">Sem pagamento após {{ b.suspendAfterDays || '—' }} dias</div>
              <div class="ct-dim">
                {{
                  !b.suspendAfterDays
                    ? 'Nunca suspende por atraso'
                    : b.suspendAction === 'suspend'
                      ? 'Matrícula suspensa e vaga liberada para a lista de espera'
                      : 'Só avisa o pagador · a matrícula continua'
                }}
              </div>
            </div>
            <label class="num">
              <input class="ct-input mono" type="number" min="0" max="180" aria-label="Dias até suspender" [value]="b.suspendAfterDays" [disabled]="!editable() || busy()" (input)="setNumber('suspendAfterDays', $event)" />
              <span class="ct-mono">dias</span>
            </label>
            <ct-segmented [options]="suspendOptions" [value]="b.suspendAction" [disabled]="!editable() || busy() || !b.suspendAfterDays" (valueChange)="set('suspendAction', $event)" />
          </div>

          @if (editable()) {
            <div class="save">
              <button type="button" class="ct-mini-btn ct-mini-btn-primary" [disabled]="busy() || changed().length === 0 || !!invalid()" (click)="save()">
                {{ busy() ? 'Salvando…' : 'Salvar alterações' }}
              </button>
              @if (changed().length) {
                <button type="button" class="ct-ghost-btn" [disabled]="busy()" (click)="discard()">Descartar</button>
              }
              @if (saved() && changed().length === 0) {
                <span class="ct-dim">Salvo. Vale a partir dos próximos ciclos.</span>
              }
            </div>
            @if (err() || invalid()) {
              <p class="ct-error-text" role="alert">{{ err() || invalid() }}</p>
            }
          }
        </section>

        <div class="side">
          <section class="ct-card">
            <div class="ct-card-head">
              <div class="ct-grow">
                <div class="ct-kick">Avisos automáticos ao pagador · push</div>
                <div class="ct-card-title">Régua de cobrança</div>
              </div>
            </div>
            @for (s of ladder(); track s.day + s.title; let last = $last) {
              <div class="step">
                <span class="ct-mono day">{{ s.day }}</span>
                <span class="rail"><span class="dot" [class]="'dot ' + s.tone"></span>@if (!last) {<span class="line"></span>}</span>
                <div>
                  <div class="ct-disp">{{ s.title }}</div>
                  <div class="ct-dim">{{ s.detail }}</div>
                </div>
              </div>
            }
          </section>

          <section class="ct-card">
            <div class="ct-kick">Exemplo com estas regras</div>
            <p class="ct-muted ex">{{ example() }}</p>
          </section>

          @if (ctx.isManager() && audit().length) {
            <section class="ct-card"><ct-audit-trail [rows]="audit()" /></section>
          }
        </div>
      </div>
    }
  `,
  styles: `
    .row { padding: 14px 0; border-top: 1px solid var(--nx-line); display: flex; align-items: center; gap: 12px 16px; flex-wrap: wrap; }
    .row .ct-grow { min-width: 220px; }
    .row .ct-dim { margin-top: 3px; }
    .row.off { opacity: 0.45; }
    .methods { display: flex; gap: 6px; flex-wrap: wrap; }
    .num { display: flex; align-items: center; gap: 8px; }
    .num .ct-input { width: 80px; height: 36px; }
    .save { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-top: 14px; }
    .side { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
    .step { display: grid; grid-template-columns: 48px 14px 1fr; gap: 10px; padding-bottom: 12px; }
    .step:last-child { padding-bottom: 0; }
    .day { padding-top: 2px; color: var(--nx-text); font-weight: 700; }
    .rail { display: flex; flex-direction: column; align-items: center; }
    .dot { width: 9px; height: 9px; border-radius: 50%; margin-top: 4px; border: 1px solid var(--nx-line-strong); background: var(--nx-surface-2); }
    .dot.orange { background: var(--nx-orange-500); }
    .dot.yellow { background: var(--nx-pending); }
    .dot.red { background: var(--nx-live); }
    .line { flex: 1; width: 1px; background: var(--nx-line-strong); margin-top: 3px; }
    .ex { margin: 8px 0 0; line-height: 1.5; }
  `,
})
export class BillingSettingsComponent {
  readonly editable = input(false);

  protected readonly ctx = inject(CenterContextService);
  private readonly store = inject(CenterStore);
  private readonly actions = inject(CenterActions);

  protected readonly modeOptions = [
    { value: 'fixed', label: 'Dia fixo' },
    { value: 'enrollment', label: 'Data da matrícula' },
  ];
  protected readonly firstOptions = [
    { value: 'prorata', label: 'Proporcional' },
    { value: 'full', label: 'Mês cheio' },
  ];
  protected readonly feeOptions = [
    { value: 'true', label: 'Cobrar' },
    { value: 'false', label: 'Não cobrar' },
  ];
  protected readonly suspendOptions = [
    { value: 'suspend', label: 'Suspender' },
    { value: 'notify', label: 'Avisar só' },
  ];

  private readonly key = computed(() => JSON.stringify(this.ctx.center()?.billing ?? DEFAULT_BILLING));
  protected readonly draft = linkedSignal<string, CenterBilling>({
    source: this.key,
    computation: (k) => JSON.parse(k) as CenterBilling,
  });
  protected readonly busy = signal(false);
  protected readonly err = signal('');
  protected readonly saved = signal(false);

  protected readonly changed = computed(() => changedBilling(JSON.parse(this.key()) as CenterBilling, this.draft()));
  protected readonly invalid = computed(() => billingError(this.draft()));
  protected readonly ladder = computed(() => dunningLadder(this.draft()));

  /** Valor fora das opções (gravado antes ou por script) continua aparecendo. */
  protected readonly blockOptions = computed(() => {
    const v = String(this.draft().blockAfterDays);
    return BLOCK_OPTIONS.some((o) => o.value === v) ? BLOCK_OPTIONS : [...BLOCK_OPTIONS, { value: v, label: `${v} dias` }];
  });

  /** "Matrícula hoje num Mensal de R$ 320 → …" com o plano mensal mais barato do centro. */
  protected readonly example = computed(() => {
    const b = this.draft();
    const today = todayKey(this.ctx.center()?.timezone);
    const plan = this.store
      .plans()
      .filter((p) => p.type === 'monthly' && p.status === 'active')
      .sort((x, y) => x.priceCents - y.priceCents)[0];
    const price = plan?.priceCents ?? 32000;
    const name = plan?.name ?? 'Mensal';
    const f = firstInvoiceCents(price, b, today);
    const first = f.prorated
      ? `1ª cobrança de ${formatBRL(f.cents)} (${f.days} de ${f.cycleDays} dias)`
      : `1ª cobrança de ${formatBRL(f.cents)} (mês cheio)`;
    const every = b.billingDayMode === 'fixed' ? `todo dia ${String(b.billingDay).padStart(2, '0')}` : 'todo mês no dia da matrícula';
    return `Matrícula hoje no ${name}: ${first} na matrícula, depois ${formatBRL(price)} ${every}, a partir de ${formatDayKey(f.nextCharge)}. A cobrança de cada ciclo nasce 3 dias antes do vencimento.`;
  });

  protected readonly audit = computed(() => {
    const tz = this.ctx.center()?.timezone;
    return this.store
      .audit()
      .filter((a) => a.action === 'center.billing')
      .map((a) => ({ when: formatInstant(a.at, tz), who: a.actorName, what: a.detail }));
  });

  protected set(key: keyof CenterBilling, value: string): void {
    this.saved.set(false);
    this.draft.update((b) => {
      switch (key) {
        case 'lateFees':
          return { ...b, lateFees: value === 'true' };
        case 'blockAfterDays':
          return { ...b, blockAfterDays: Number(value) };
        default:
          return { ...b, [key]: value };
      }
    });
  }

  protected setNumber(key: 'billingDay' | 'suspendAfterDays', ev: Event): void {
    this.saved.set(false);
    const raw = (ev.target as HTMLInputElement).value;
    this.draft.update((b) => ({ ...b, [key]: raw === '' ? Number.NaN : Number(raw) }));
  }

  protected discard(): void {
    this.draft.set(JSON.parse(this.key()) as CenterBilling);
    this.err.set('');
  }

  protected async save(): Promise<void> {
    const next = this.draft();
    if (!this.editable() || this.busy() || this.invalid() || this.changed().length === 0) {
      return;
    }
    this.busy.set(true);
    this.err.set('');
    try {
      await this.actions.updateBilling(JSON.parse(this.key()) as CenterBilling, next);
      this.saved.set(true);
    } catch (e) {
      this.err.set(writeErrorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
