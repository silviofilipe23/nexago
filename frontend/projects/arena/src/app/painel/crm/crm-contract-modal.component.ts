import { ChangeDetectionStrategy, Component, computed, inject, input, signal, type OnInit } from '@angular/core';
import { ArenaContextService } from '../data/arena-context.service';
import { AthleteSearchFieldComponent } from '../recurring/athlete-search-field.component';
import type { AthleteCandidate } from '../recurring/athlete-search-filter';
import { AvatarComponent } from '../ui/avatar.component';
import { ModalComponent } from '../ui/modal.component';
import {
  DUE_DAYS,
  PERIODS,
  PERIOD_LABEL,
  PERIOD_MONTHS,
  contractSummary,
  formatPhone,
  maskedPhone,
  money,
  hoursLabel,
  monthShort,
  normalizeSearch,
  shortDate,
  type CrmCustomer,
  type CrmPeriod,
} from './crm.model';
import { type ContractFormState, CrmUiService } from './crm-ui.service';
import { CrmStore } from './crm.store';

interface Picked {
  athleteId: string | null;
  name: string;
  photoUrl: string | null;
  phone: string | null;
  detail: string;
}

/** Novo contrato / editar / renovar: plano, período, vencimento 5/15/25, horas por semana e valor,
 *  com o resumo (total, fim e parcelas) ao lado. */
@Component({
  selector: 'ar-crm-contract-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ModalComponent, AvatarComponent, AthleteSearchFieldComponent],
  styleUrls: ['./crm.scss'],
  template: `
    <ar-modal size="xl" (close)="ui.contractForm.set(null)">
      <div class="grid">
        <form class="form" (submit)="$event.preventDefault(); submit()">
          <div>
            <h2 class="m-t">{{ title() }}</h2>
            <p class="card-desc">{{ intro() }}</p>
          </div>

          <div class="field">
            <span class="field-l">Cliente</span>
            @if (picked(); as p) {
              <div class="picked">
                <ar-avatar [name]="p.name" [photoUrl]="p.photoUrl" [size]="38" />
                <div class="grow"><div class="name">{{ p.name }}</div><div class="sub">{{ p.detail }}</div></div>
                @if (state().mode === 'new' && !state().customer) {
                  <button type="button" class="link" (click)="picked.set(null)">Trocar</button>
                }
              </div>
            } @else if (manual()) {
              <div class="row2">
                <input class="input" placeholder="Nome do cliente" aria-label="Nome do cliente" [value]="manualName()" (input)="manualName.set($any($event.target).value)" />
                <input class="input" placeholder="WhatsApp com DDD" aria-label="WhatsApp" inputmode="tel" [value]="manualPhone()" (input)="manualPhone.set($any($event.target).value)" />
              </div>
              <button type="button" class="link left" (click)="manual.set(false)">Buscar na base</button>
            } @else {
              <input class="input" placeholder="Buscar cliente da arena" aria-label="Buscar cliente da arena" [value]="query()" (input)="query.set($any($event.target).value)" />
              @if (matches().length) {
                <div class="matches">
                  @for (c of matches(); track c.key) {
                    <button type="button" class="match" (click)="pickCustomer(c)">
                      <ar-avatar [name]="c.name" [photoUrl]="c.photoUrl" [size]="28" /><span class="name">{{ c.name }}</span><span class="sub">{{ c.bookings6m }} reservas</span>
                    </button>
                  }
                </div>
              }
              @if (arenaId(); as id) {
                <span class="hint">Ou um atleta que segue a arena:</span>
                <ar-athlete-search-field [arenaId]="id" (selected)="pickAthlete($event)" />
              }
              <button type="button" class="link left" (click)="manual.set(true)">Cliente sem app (nome e telefone)</button>
            }
          </div>

          <div class="row2">
            <div class="field">
              <label class="field-l" for="plano">Plano</label>
              <input id="plano" class="input" list="crm-plans" [value]="planName()" (input)="onPlanName($any($event.target).value)" placeholder="Ex.: Noite 2x" />
              <datalist id="crm-plans">@for (p of plans(); track p.id) { <option [value]="p.name"></option> }</datalist>
              <span class="hint">Livre ou um dos Planos de horário da arena</span>
            </div>
            <div class="field">
              <label class="field-l" for="valor">Valor mensal</label>
              <div class="input pre"><span>R$</span><input id="valor" inputmode="decimal" [value]="priceText()" (input)="priceText.set($any($event.target).value)" /></div>
              @if (walkInSpend(); as s) { <span class="hint">Avulso hoje: {{ money(s) }}/mês</span> }
            </div>
          </div>

          <div class="field">
            <span class="field-l" id="per-l">Período</span>
            <div class="chips" role="radiogroup" aria-labelledby="per-l">
              @for (p of periods; track p) {
                <button type="button" class="chip" role="radio" [class.on]="period() === p" [attr.aria-checked]="period() === p" (click)="setPeriod(p)">{{ periodLabel[p] }}<small>{{ months[p] }} {{ months[p] === 1 ? 'mês' : 'meses' }}</small></button>
              }
            </div>
          </div>

          <div class="row2">
            <div class="field">
              <span class="field-l" id="venc-l">Vencimento</span>
              <div class="days" role="radiogroup" aria-labelledby="venc-l">
                @for (d of dueDays; track d) {
                  <button type="button" class="day" role="radio" [class.on]="dueDay() === d" [attr.aria-checked]="dueDay() === d" (click)="dueDay.set(d)">{{ pad(d) }}<small>todo mês</small></button>
                }
              </div>
            </div>
            <div class="field">
              <span class="field-l" id="fq-l">Horas por semana</span>
              <div class="freq hours" role="group" aria-labelledby="fq-l">
                <button type="button" aria-label="Meia hora a menos" [disabled]="hours() <= minHours" (click)="stepHours(-0.5)">−</button>
                <output aria-live="polite">{{ hoursLabel(hours()) }}</output>
                <button type="button" aria-label="Meia hora a mais" [disabled]="hours() >= maxHours" (click)="stepHours(0.5)">+</button>
              </div>
              <span class="hint">no dia e horário que quiser, seg a dom · o CRM avisa quando usar pouco</span>
            </div>
          </div>

          @if (state().mode !== 'renew') {
            <div class="row2">
              <div class="field">
                <label class="field-l" for="ini">Início</label>
                <input id="ini" type="date" class="input" [value]="startDate()" (input)="startDate.set($any($event.target).value)" />
              </div>
              <div class="field">
                <label class="field-l" for="obs">Observação</label>
                <input id="obs" class="input" placeholder="Opcional" [value]="note()" (input)="note.set($any($event.target).value)" />
              </div>
            </div>
          }

          <div class="toggle">
            <div><div class="name">Renovar sozinho no fim do período</div><div class="sub">{{ autoRenew() ? 'Continua até alguém cancelar.' : 'Entra em "Vencendo" 30 dias antes do fim, para o time renovar.' }}</div></div>
            <button type="button" class="switch" role="switch" [class.on]="autoRenew()" [attr.aria-checked]="autoRenew()" aria-label="Renovar sozinho" (click)="autoRenew.set(!autoRenew())"></button>
          </div>
          @if (error(); as err) { <p class="err" role="alert">{{ err }}</p> }
        </form>

        <aside class="sum" aria-label="Resumo do contrato">
          <div class="label">Resumo</div>
          <div class="big">{{ money(summary().total) }}<small> {{ totalLabel() }}</small></div>
          <div>
            <div class="kv"><span>Mensal</span><b>{{ money(price()) }}</b></div>
            <div class="kv"><span>Horas por semana</span><b>{{ hoursLabel(hours()) }}</b></div>
            <div class="kv"><span>Parcelas</span><b>{{ summary().months }} · dia {{ pad(dueDay()) }}</b></div>
            <div class="kv"><span>Fim do período</span><b>{{ shortDate(summary().endDate) }}</b></div>
            @if (savings() > 0) { <div class="kv"><span>Economia do cliente</span><b class="good">{{ money(savings()) }}</b></div> }
          </div>
          <div class="label">Parcelas</div>
          <div class="cal">
            @for (m of summary().installments; track m; let first = $first) { <span [class.first]="first">{{ monthShort(m) }}</span> }
          </div>
          <p class="sub">A 1ª parcela vence no início ({{ shortDate(effectiveStart()) }}), as próximas no dia {{ pad(dueDay()) }}. O pagamento é registrado aqui; inadimplência entra na fila no dia seguinte ao vencimento.</p>
          <div class="end">
            <button type="button" class="btn primary lg" [disabled]="busy()" (click)="submit()">{{ cta() }}</button>
            <button type="button" class="btn lg ghost" (click)="ui.contractForm.set(null)">Cancelar</button>
          </div>
        </aside>
      </div>
    </ar-modal>
  `,
  styles: `
    @use 'breakpoints' as ar;
    .grid { display: grid; grid-template-columns: minmax(0, 1fr) 300px; }
    .form { padding: 26px 28px; display: flex; flex-direction: column; gap: 18px; min-width: 0; }
    .m-t { font-family: var(--nx-font-display); font-weight: 700; font-size: 22px; margin: 0; color: var(--nx-text); }
    .field { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
    .field-l { font-size: 12.5px; font-weight: 600; color: var(--nx-text); }
    .hint { font-size: 11.5px; color: var(--nx-text-dim); }
    .input { height: 44px; box-sizing: border-box; padding: 0 14px; border-radius: 10px; background: var(--nx-surface-1); border: 1px solid var(--nx-line-strong); font: 14px var(--nx-font-ui); color: var(--nx-text); width: 100%; color-scheme: dark; }
    .input:focus, .input:focus-within { outline: none; border-color: var(--nx-orange-500); }
    .pre { display: flex; align-items: center; gap: 8px; }
    .pre span { font-family: var(--nx-font-mono); color: var(--nx-text-dim); }
    .pre input { flex: 1; min-width: 0; background: transparent; border: none; color: var(--nx-text); font: inherit; outline: none; }
    .picked { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 12px; background: rgba(255,106,26,.06); border: 1px solid rgba(255,106,26,.45); }
    .grow { flex: 1; min-width: 0; }
    .link { font: 600 12px var(--nx-font-ui); color: var(--nx-orange-400); background: none; border: none; cursor: pointer; padding: 0; }
    .link.left { align-self: flex-start; }
    .matches { display: flex; flex-direction: column; border: 1px solid var(--nx-line); border-radius: 10px; overflow: hidden; }
    .match { display: flex; align-items: center; gap: 10px; padding: 8px 10px; background: var(--nx-surface-1); border: none; border-bottom: 1px solid var(--nx-line); color: inherit; cursor: pointer; text-align: left; }
    .match .name { flex: 1; font-size: 13px; }
    .match:hover { background: var(--nx-surface-2); }
    .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    .chips { display: flex; flex-wrap: wrap; gap: 8px; }
    .chip { display: inline-flex; flex-direction: column; align-items: flex-start; justify-content: center; gap: 2px; min-height: 48px; padding: 0 16px; border-radius: 12px; border: 1px solid var(--nx-line-strong); background: var(--nx-surface-1); color: var(--nx-text); font: 600 13px var(--nx-font-ui); cursor: pointer; }
    .chip small, .day small { font: 500 9px var(--nx-font-mono); letter-spacing: .1em; text-transform: uppercase; color: var(--nx-text-dim); }
    .chip.on { background: rgba(255,106,26,.12); border-color: var(--nx-orange-500); color: var(--nx-orange-400); }
    .days { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
    .day { min-height: 60px; border-radius: 12px; border: 1px solid var(--nx-line-strong); background: var(--nx-surface-1); color: var(--nx-text); font: 700 20px var(--nx-font-display); cursor: pointer; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; }
    .day.on { background: var(--nx-orange-500); border-color: var(--nx-orange-500); color: var(--nx-text-on-orange); }
    .day.on small { color: rgba(10,10,10,.65); }
    .freq { display: inline-flex; padding: 3px; border-radius: 10px; background: var(--nx-surface-1); border: 1px solid var(--nx-line); align-self: flex-start; }
    .freq button { min-width: 48px; padding: 9px 10px; border-radius: 8px; font: 700 13px var(--nx-font-ui); color: var(--nx-text-mute); background: none; border: none; cursor: pointer; }
    .freq button.on { background: var(--nx-orange-500); color: var(--nx-text-on-orange); }
    .hours { align-items: center; }
    .hours button { font-size: 18px; line-height: 1; }
    .hours button:disabled { opacity: .35; cursor: default; }
    .hours output { min-width: 64px; text-align: center; font: 700 15px var(--nx-font-display); color: var(--nx-text); }
    .toggle { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 16px; border-radius: 12px; background: var(--nx-surface-1); border: 1px solid var(--nx-line); }
    .switch { width: 42px; height: 24px; border-radius: 999px; background: var(--nx-surface-2); border: 1px solid var(--nx-line-strong); position: relative; flex: none; padding: 0; cursor: pointer; }
    .switch::after { content: ''; position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%; background: var(--nx-text-mute); transition: left 140ms; }
    .switch.on { background: var(--nx-orange-500); border-color: var(--nx-orange-500); }
    .switch.on::after { left: 21px; background: var(--nx-text-on-orange); }
    .err { color: var(--nx-live); font-size: 12.5px; margin: 0; }
    .sum { background: radial-gradient(140% 90% at 100% 0%, rgba(255,106,26,.18), rgba(255,106,26,0) 60%), var(--nx-surface-1); border-left: 1px solid var(--nx-line); padding: 26px 22px; display: flex; flex-direction: column; gap: 14px; }
    .big { font-family: var(--nx-font-display); font-weight: 700; font-size: 32px; letter-spacing: -.02em; color: var(--nx-text); }
    .big small { font-size: 13px; color: var(--nx-text-dim); }
    .kv { display: flex; justify-content: space-between; font-size: 12.5px; padding: 7px 0; color: var(--nx-text-mute); border-bottom: 1px solid var(--nx-line); }
    .kv b { color: var(--nx-text); font: 600 12px var(--nx-font-mono); }
    .cal { display: grid; grid-template-columns: repeat(6, 1fr); gap: 5px; }
    .cal span { height: 30px; border-radius: 7px; background: var(--nx-surface-0); border: 1px solid var(--nx-line); display: flex; align-items: center; justify-content: center; font: 10px var(--nx-font-mono); text-transform: uppercase; color: var(--nx-text-mute); }
    .cal span.first { border-color: var(--nx-orange-500); color: var(--nx-orange-400); }
    .end { margin-top: auto; display: flex; flex-direction: column; gap: 10px; }
    .ghost { background: transparent; }
    @include ar.below(md) {
      .grid, .row2 { grid-template-columns: minmax(0, 1fr); }
      .sum { border-left: none; border-top: 1px solid var(--nx-line); }
    }
  `,
})
export class CrmContractModalComponent implements OnInit {
  readonly state = input.required<ContractFormState>();

  protected readonly store = inject(CrmStore);
  protected readonly ui = inject(CrmUiService);
  private readonly arenaContext = inject(ArenaContextService);

  protected readonly periods = PERIODS;
  protected readonly periodLabel = PERIOD_LABEL;
  protected readonly months = PERIOD_MONTHS;
  protected readonly dueDays = DUE_DAYS;
  protected readonly money = money;
  protected readonly monthShort = monthShort;
  protected readonly shortDate = shortDate;
  protected readonly arenaId = this.arenaContext.arenaId;
  protected readonly plans = computed(() => this.store.overview()?.plans ?? []);

  protected readonly picked = signal<Picked | null>(null);
  protected readonly manual = signal(false);
  protected readonly manualName = signal('');
  protected readonly manualPhone = signal('');
  protected readonly query = signal('');
  protected readonly planId = signal<string | null>(null);
  protected readonly planName = signal('');
  protected readonly priceText = signal('');
  protected readonly period = signal<CrmPeriod>('monthly');
  protected readonly dueDay = signal(5);
  /** Banco de horas da semana, de meia em meia hora. */
  protected readonly hours = signal(2);
  protected readonly minHours = 0.5;
  protected readonly maxHours = 40;
  protected readonly hoursLabel = hoursLabel;
  protected readonly startDate = signal('');
  protected readonly autoRenew = signal(true);
  protected readonly note = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  ngOnInit(): void {
    const s = this.state();
    const p = s.prefill;
    if (s.customer) this.picked.set(this.fromCustomer(s.customer));
    if (p.customerName && s.customer) this.picked.update((x) => (x ? { ...x, name: p.customerName!, phone: p.customerPhone ?? x.phone } : x));
    this.planId.set(p.planId ?? null);
    this.planName.set(p.planName ?? '');
    this.priceText.set(p.monthlyPriceReais ? String(p.monthlyPriceReais).replace('.', ',') : '');
    this.period.set(p.period ?? 'monthly');
    this.dueDay.set(p.dueDay && DUE_DAYS.includes(p.dueDay) ? p.dueDay : 5);
    this.hours.set(p.weeklyHours ?? 2);
    this.startDate.set(p.startDate ?? this.store.today());
    this.autoRenew.set(p.autoRenew ?? (p.period ?? 'monthly') === 'monthly');
    this.note.set(p.note ?? '');
  }

  protected readonly price = computed(() => {
    const n = Number(this.priceText().replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
  });

  protected readonly matches = computed(() => {
    const q = normalizeSearch(this.query());
    if (q.length < 2) return [];
    return this.store.customers().filter((c) => normalizeSearch(c.name).includes(q)).slice(0, 6);
  });

  /** Renovação começa no dia seguinte ao fim do contrato atual (mostrado só no resumo). */
  protected readonly effectiveStart = computed(() => {
    const s = this.state();
    if (s.mode !== 'renew') return this.startDate() || this.store.today();
    const end = s.customer?.contract?.endDate;
    if (!end) return this.store.today();
    const next = new Date(`${end}T12:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    const key = next.toISOString().slice(0, 10);
    return key < this.store.today() ? this.store.today() : key;
  });

  protected readonly summary = computed(() => contractSummary(this.effectiveStart(), this.period(), this.dueDay(), this.price()));
  protected readonly walkInSpend = computed(() => (this.state().customer?.conversion?.avgMonthlyReais ? Math.round(this.state().customer!.conversion!.avgMonthlyReais) : 0));
  protected readonly savings = computed(() => (this.walkInSpend() > this.price() && this.price() > 0 ? (this.walkInSpend() - this.price()) * this.summary().months : 0));

  protected readonly title = computed(() => ({ new: 'Novo contrato de mensalista', edit: 'Editar contrato', renew: 'Renovar contrato' })[this.state().mode]);
  protected readonly intro = computed(() => {
    const s = this.state();
    if (s.mode === 'renew') return 'O contrato novo começa no dia seguinte ao fim do atual, com as condições que você escolher.';
    if (s.mode === 'edit') return 'Mudanças valem para as parcelas em aberto. Pagamentos já registrados ficam como estão.';
    return s.customer?.conversion ? 'Veio da oferta: plano, valor e horas da semana já preenchidos.' : 'Cliente, plano e condições. O CRM acompanha vencimentos e o uso das horas.';
  });
  protected readonly cta = computed(() => ({ new: 'Criar contrato', edit: 'Salvar alterações', renew: 'Renovar' })[this.state().mode]);
  protected readonly totalLabel = computed(() => {
    const p = this.period();
    return p === 'monthly' ? 'no mês' : p === 'quarterly' ? 'no trimestre' : p === 'semiannual' ? 'no semestre' : 'no ano';
  });

  protected pad(n: number): string {
    return String(n).padStart(2, '0');
  }

  protected setPeriod(p: CrmPeriod): void {
    this.period.set(p);
    if (this.state().mode === 'new') this.autoRenew.set(p === 'monthly');
  }

  protected stepHours(delta: number): void {
    this.hours.update((h) => Math.min(this.maxHours, Math.max(this.minHours, Math.round((h + delta) * 2) / 2)));
  }

  protected onPlanName(name: string): void {
    this.planName.set(name);
    const plan = this.plans().find((p) => normalizeSearch(p.name) === normalizeSearch(name));
    this.planId.set(plan?.id ?? null);
    if (plan) {
      this.priceText.set(String(plan.monthlyPriceReais).replace('.', ','));
      this.hours.set(plan.weeklyHours ?? Math.max(1, plan.timesPerWeek));
    }
  }

  protected pickCustomer(c: CrmCustomer): void {
    this.picked.set(this.fromCustomer(c));
    this.query.set('');
  }

  protected pickAthlete(a: AthleteCandidate): void {
    const known = this.store.byKey().get(`a:${a.athleteId}`);
    this.picked.set(known ? this.fromCustomer(known) : { athleteId: a.athleteId, name: a.name, photoUrl: a.photoUrl ?? null, phone: null, detail: 'Atleta no app · segue a arena' });
  }

  private fromCustomer(c: CrmCustomer): Picked {
    const phone = maskedPhone(c.phone);
    const parts = [c.athleteId ? 'Atleta no app' : 'Cliente sem app'];
    if (phone) parts.push(phone);
    if (c.conversion) parts.push(`${c.conversion.avulso90d} reservas em 90 dias`);
    return { athleteId: c.athleteId, name: c.name, photoUrl: c.photoUrl, phone: c.athleteId ? null : c.phone, detail: parts.join(' · ') };
  }

  protected async submit(): Promise<void> {
    if (this.busy()) return;
    const s = this.state();
    const who = this.picked() ?? (this.manual() && this.manualName().trim()
      ? { athleteId: null, name: this.manualName().trim(), photoUrl: null, phone: formatPhone(this.manualPhone().trim()) || null, detail: '' }
      : null);
    if (s.mode !== 'renew' && !who) return this.error.set('Escolha o cliente.');
    if (!this.planName().trim()) return this.error.set('Informe o plano.');
    if (this.price() <= 0) return this.error.set('Informe o valor mensal.');

    this.busy.set(true);
    this.error.set(null);
    try {
      if (s.mode === 'renew' && s.contractId) {
        await this.store.renewContract(s.contractId, { period: this.period(), dueDay: this.dueDay(), monthlyPriceReais: this.price(), autoRenew: this.autoRenew() });
        this.ui.flash('Contrato renovado.');
      } else {
        await this.store.saveContract({
          contractId: s.mode === 'edit' ? s.contractId : null,
          athleteId: who!.athleteId,
          customerName: who!.name,
          customerPhone: who!.athleteId ? null : who!.phone,
          planId: this.planId(),
          planName: this.planName().trim(),
          period: this.period(),
          dueDay: this.dueDay(),
          weeklyHours: this.hours(),
          monthlyPriceReais: this.price(),
          startDate: this.startDate() || this.store.today(),
          autoRenew: this.autoRenew(),
          note: this.note().trim() || null,
        });
        this.ui.flash(s.mode === 'edit' ? 'Contrato atualizado.' : `Contrato criado: ${who!.name} agora é mensalista.`);
      }
      this.ui.contractForm.set(null);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Não foi possível salvar o contrato.');
    } finally {
      this.busy.set(false);
    }
  }
}
