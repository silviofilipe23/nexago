import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AvatarComponent } from '../ui/avatar.component';
import { DrawerComponent } from '../ui/drawer.component';
import { IconComponent } from '../ui/icon.component';
import { PillComponent } from '../ui/pill.component';
import {
  CHANNEL_LABEL,
  OUTCOMES,
  OUTCOME_LABEL,
  canChargeOnline,
  paymentMethodLabel,
  PERIOD_LABEL,
  REMINDER_LABEL,
  STATUS_LABEL,
  customerInsight,
  dayMonth,
  formatPhone,
  installmentStrip,
  money,
  monthShort,
  monthYear,
  patternLabel,
  hoursLabel,
  weekUsage,
  profileMessage,
  profileReason,
  shortDate,
  statusLabel,
  statusTone,
  type CrmContactChannel,
  type CrmContactOutcome,
  type CrmCustomer,
  type CrmCustomerDetail,
} from './crm.model';
import { CrmUiService } from './crm-ui.service';
import { CrmStore } from './crm.store';

interface TimelineEntry {
  at: string;
  who: string;
  text: string;
  tone: 'orange' | 'green' | 'red' | 'dim';
}

/** Ficha do cliente: contrato e parcelas, reservas por mês, insight, contato e linha do tempo. */
@Component({
  selector: 'ar-crm-customer-drawer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DrawerComponent, AvatarComponent, PillComponent, IconComponent, RouterLink],
  styleUrls: ['./crm.scss'],
  template: `
    <ar-drawer width="880px" [ariaLabel]="'Ficha de ' + (customer()?.name ?? 'cliente')" (close)="ui.drawerKey.set(null)">
      @if (customer(); as c) {
        <header class="d-head">
          <div class="d-top">
            <div class="av-cell">
              <ar-avatar [name]="c.name" [photoUrl]="c.photoUrl" [size]="64" zoomable />
              <div>
                <h2 class="d-name">{{ c.name }}</h2>
                <div class="sub">{{ meta(c) }}</div>
                <div class="pills">
                  <ar-pill [tone]="tone(c)">{{ label(c) }}</ar-pill>
                  @if (c.contract?.source === 'schedule_plan') { <ar-pill tone="dim">Plano de horário · app</ar-pill> }
                  @if (c.contract?.paused) { <ar-pill tone="dim">Pausado</ar-pill> }
                </div>
              </div>
            </div>
            <button type="button" class="close" aria-label="Fechar ficha" (click)="ui.drawerKey.set(null)"><ar-icon name="x" [size]="16" /></button>
          </div>
          <div class="d-acts">
            <button type="button" class="btn wa lg" [disabled]="!c.whatsapp" (click)="whatsapp(c)"><ar-icon name="message" [size]="14" /> WhatsApp{{ waHint(c) }}</button>
            @if (ui.canWrite()) {
              @if (ownContract(); as v) {
                @if (canCharge(c) && !v.onlineLink) {
                  <button type="button" class="btn primary lg" (click)="ui.chargeFor.set(c)">Cobrar online</button>
                }
                @if (v.status !== 'canceled' && (v.totalInstallments === null || v.paidInstallments < v.totalInstallments)) {
                  <button type="button" class="btn lg" [class.primary]="!canCharge(c)" (click)="ui.paymentFor.set(c)">Registrar pagamento</button>
                }
                @if (!v.renewedToId && v.status !== 'canceled' && !v.autoRenew) {
                  <button type="button" class="btn lg" (click)="renew(c)">Renovar contrato</button>
                }
                <button type="button" class="btn lg" (click)="edit(c)">Editar</button>
                @if (v.status !== 'canceled') {
                  <button type="button" class="btn lg" (click)="canceling.set(true)">Cancelar</button>
                }
              }
              @if (c.kind !== 'member') {
                <button type="button" class="btn primary lg" (click)="c.conversion ? ui.contractFromOffer(c) : ui.newContract(c)">Criar contrato</button>
              }
            }
          </div>
          @if (canceling()) {
            <div class="cancel">
              <label class="field-l" for="cancel-reason">Motivo do cancelamento (opcional)</label>
              <input id="cancel-reason" class="input" [value]="cancelReason()" (input)="cancelReason.set($any($event.target).value)" placeholder="Ex.: mudou de cidade" />
              <div class="row-acts">
                <button type="button" class="btn" (click)="canceling.set(false)">Voltar</button>
                <button type="button" class="btn danger" [disabled]="busy()" (click)="cancel()">Cancelar contrato</button>
              </div>
            </div>
          }
          @if (error(); as err) { <p class="err">{{ err }}</p> }
        </header>

        <div class="d-body">
          <div class="col">
            @if (c.contract; as v) {
              <section class="card inner" aria-labelledby="ct-t">
                <div class="c-h"><h3 class="card-title" id="ct-t">{{ v.source === 'schedule_plan' ? 'Plano de horário' : 'Contrato' }} · {{ v.planName }}</h3><span class="label">desde {{ shortDate(v.startDate) }}</span></div>
                <div class="grid4">
                  <div class="f"><div class="label">Período</div><div class="f-v">{{ periodLabel[v.period] }}</div></div>
                  <div class="f"><div class="label">Vencimento</div><div class="f-v">Dia {{ pad(v.dueDay) }}</div></div>
                  <div class="f"><div class="label">Horas</div><div class="f-v">{{ hoursLabel(v.weeklyHours) }}/sem</div></div>
                  <div class="f"><div class="label">Valor</div><div class="f-v">{{ money(v.monthlyPriceReais) }}</div></div>
                </div>
                @if (usage(); as u) {
                  <div class="use" aria-label="Uso do banco de horas">
                    <div class="use-h">
                      <span class="label">Esta semana</span>
                      <span class="use-v"><b>{{ hoursLabel(u.used) }}</b> de {{ hoursLabel(u.total) }} · {{ u.left ? 'sobram ' + hoursLabel(u.left) : 'banco usado' }}</span>
                    </div>
                    <div class="meter" role="progressbar" aria-valuemin="0" [attr.aria-valuemax]="u.total" [attr.aria-valuenow]="u.used"><i [style.width.%]="u.pct"></i></div>
                    <div class="weeks" [attr.aria-label]="weeksLabel(c, v.weeklyHours)" role="img">
                      @for (w of c.weekHours ?? []; track $index; let last = $last) {
                        <i [class.cur]="last" [class.over]="w > v.weeklyHours" [style.height.%]="weekBar(w, v.weeklyHours)" [attr.title]="hoursLabel(w)"></i>
                      }
                    </div>
                    <span class="sub">Joga no dia e horário que quiser, de seg a dom. Últimas 8 semanas; a linha é o contratado.</span>
                  </div>
                }
                @if (strip().length) {
                  <div class="inst" aria-label="Parcelas">
                    @for (i of strip(); track i.month) {
                      <div class="ins" [class]="'ins ' + i.state"><b>{{ monthShort(i.month) }}</b><small>{{ stateLabel[i.state] }}</small></div>
                    }
                  </div>
                }
                @if (v.onlineLink; as l) {
                  <div class="banner">
                    <div>
                      <div class="name sm">Link aberto · {{ money(l.amountReais) }}</div>
                      <div class="sub">{{ l.installments }} {{ l.installments === 1 ? 'parcela' : 'parcelas' }} · gerado {{ dayMonth(l.createdAt.slice(0, 10)) }}{{ l.byName ? ' por ' + l.byName.split(' ')[0] : '' }}</div>
                    </div>
                    <div class="row-acts">
                      <button type="button" class="btn" (click)="copyLink(l.invoiceUrl)">Copiar</button>
                      @if (ui.canWrite()) { <button type="button" class="btn" [disabled]="busy()" (click)="cancelLink()">Cancelar link</button> }
                    </div>
                  </div>
                }
                <p class="sub">
                  @if (v.source === 'schedule_plan') {
                    A cobrança deste cliente é feita pelos Planos de horário. <a routerLink="/painel/planos-horario/assinantes">Ver assinante</a>
                  } @else {
                    {{ v.autoRenew ? 'Renova sozinho a cada ' + periodLabel[v.period].toLowerCase() : 'Termina em ' + shortDate(v.endDate) }}
                    @if (v.nextDueDate) { · próximo vencimento {{ dayMonth(v.nextDueDate) }} }
                  }
                </p>
              </section>
            }

            <section class="card inner" aria-labelledby="hist-t">
              <div class="c-h"><h3 class="card-title" id="hist-t">Reservas por mês</h3><span class="label">Últimos 6 meses</span></div>
              <div class="chart" role="img" [attr.aria-label]="chartLabel(c)">
                @for (m of c.months; track m.month) {
                  <div class="col-bar">
                    <span class="n">{{ m.total }}</span>
                    @if (m.avulso) { <i class="a" [style.height.%]="h(m.avulso)"></i> }
                    @if (m.plan) { <i class="p" [style.height.%]="h(m.plan)"></i> }
                  </div>
                }
              </div>
              <div class="months">@for (m of c.months; track m.month) { <span>{{ monthShort(m.month) }}</span> }</div>
              <div class="legend"><span><i class="sw p"></i>Pelo contrato</span><span><i class="sw a"></i>Avulsas · {{ money(c.avulsoReais6m) }}</span></div>
              @if (insight(); as text) {
                <div class="insight"><ar-icon name="alert-triangle" [size]="16" /><span>{{ text }}</span></div>
              }
            </section>

            @if (detail()?.contracts?.length) {
              <section class="card inner" aria-labelledby="hc-t">
                <h3 class="card-title" id="hc-t">Contratos</h3>
                @for (h of detail()!.contracts; track h.id) {
                  <div class="kv"><span>{{ h.planName }} · {{ periodLabel[h.period] }} · {{ shortDate(h.startDate) }}</span>
                    <b>{{ h.renewedToId ? 'Renovado' : statusText[h.status] }} · {{ money(h.monthlyPriceReais) }}</b></div>
                }
              </section>
            }
          </div>

          <div class="col">
            <section class="card inner" aria-labelledby="ct2-t">
              <h3 class="card-title" id="ct2-t">Contato</h3>
              <div class="kv"><span>WhatsApp</span><b>{{ phone(c) }}</b></div>
              <div class="kv"><span>Costuma jogar</span><b>{{ c.pattern.length ? patternLabel(c.pattern) : 'sem dia fixo' }}</b></div>
              <div class="kv"><span>Último jogo</span><b>{{ c.lastVisitDate ? dayMonth(c.lastVisitDate) + ' · ' + ago(c) : '—' }}</b></div>
              <div class="kv"><span>Horas jogadas</span><b>{{ hoursLabel(c.hoursPerWeek ?? 0) }}/sem</b></div>
              @if (c.contract?.overdueReais) { <div class="kv"><span>Em atraso</span><b class="red">{{ money(c.contract!.overdueReais) }}</b></div> }
            </section>

            @if (ui.canWrite()) {
              <section class="card inner" aria-labelledby="log-t">
                <h3 class="card-title" id="log-t">Registrar contato</h3>
                <div class="outs" role="group" aria-label="Como foi">
                  @for (o of outcomes; track o.id) {
                    <button type="button" class="out" [class.on]="outcome() === o.id" [attr.aria-pressed]="outcome() === o.id" (click)="outcome.set(o.id)">{{ o.label }}</button>
                  }
                </div>
                <div class="seg" role="group" aria-label="Canal">
                  @for (ch of channels; track ch) {
                    <button type="button" [class.on]="channel() === ch" (click)="channel.set(ch)">{{ channelLabel[ch] }}</button>
                  }
                </div>
                <label class="field-l" for="nota">Anotação</label>
                <textarea id="nota" class="input area" [value]="note()" (input)="note.set($any($event.target).value)" placeholder="Ex.: paga as duas na sexta"></textarea>
                <button type="button" class="btn primary" [disabled]="busy() || !outcome()" (click)="saveContact(c)">Salvar contato</button>
              </section>
            }

            <section class="card inner" aria-labelledby="tl-t">
              <h3 class="card-title" id="tl-t">Linha do tempo</h3>
              @if (loadingDetail()) {
                <p class="sub">Carregando…</p>
              } @else {
                <ul class="tl">
                  @for (e of timeline(); track $index) {
                    <li><span class="dot" [class]="'dot ' + e.tone"></span><div><div class="tl-w">{{ e.at }} · {{ e.who }}</div><div class="tl-t">{{ e.text }}</div></div></li>
                  } @empty {
                    <li class="sub">Nada registrado ainda.</li>
                  }
                </ul>
              }
            </section>
          </div>
        </div>
      } @else {
        <p class="state">Cliente não encontrado. Ele pode ter saído da janela de 6 meses.</p>
      }
    </ar-drawer>
  `,
  styles: `
    @use 'breakpoints' as ar;
    .d-head { padding-bottom: 18px; border-bottom: 1px solid var(--nx-line); }
    .d-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
    .d-name { font-family: var(--nx-font-display); font-weight: 700; font-size: 24px; margin: 0; color: var(--nx-text); letter-spacing: -.01em; }
    .pills { display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap; }
    .close { width: 40px; height: 40px; border-radius: 10px; border: 1px solid var(--nx-line-strong); background: var(--nx-surface-1); color: var(--nx-text); display: inline-flex; align-items: center; justify-content: center; cursor: pointer; flex: none; }
    .d-acts { display: flex; gap: 8px; margin-top: 16px; flex-wrap: wrap; }
    .btn.danger { color: var(--nx-live); border-color: rgba(255,59,48,.45); }
    .cancel { margin-top: 14px; padding: 14px; border-radius: 12px; border: 1px solid rgba(255,59,48,.35); background: rgba(255,59,48,.05); display: flex; flex-direction: column; gap: 8px; }
    .row-acts { display: flex; gap: 8px; justify-content: flex-end; }
    .err { color: var(--nx-live); font-size: 12.5px; margin: 10px 0 0; }
    .d-body { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 16px; padding-top: 20px; align-items: start; }
    .col { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
    .inner { background: var(--nx-surface-1); padding: 18px; }
    .c-h { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
    .grid4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 14px 0; }
    .use { display: flex; flex-direction: column; gap: 8px; margin-bottom: 14px; padding: 12px 14px; border-radius: 12px; background: var(--nx-surface-1); border: 1px solid var(--nx-line); }
    .use-h { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
    .use-v { font-size: 12.5px; color: var(--nx-text-mute); } .use-v b { color: var(--nx-text); font-family: var(--nx-font-display); font-size: 15px; }
    .meter { height: 8px; border-radius: 99px; background: var(--nx-line); overflow: hidden; }
    .meter i { display: block; height: 100%; border-radius: inherit; background: var(--nx-orange-500); }
    .weeks { position: relative; display: flex; align-items: flex-end; gap: 4px; height: 44px; border-top: 1px dashed var(--nx-line-strong); padding-top: 0; margin-top: 10px; }
    .weeks i { flex: 1; min-height: 2px; border-radius: 3px 3px 0 0; background: var(--nx-line-strong); }
    .weeks i.cur { background: var(--nx-orange-500); } .weeks i.over { background: var(--nx-win); }
    .f { background: var(--nx-surface-0); border-radius: 10px; padding: 10px 12px; }
    .f-v { font-family: var(--nx-font-display); font-weight: 700; font-size: 15px; margin-top: 3px; color: var(--nx-text); }
    .inst { display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px; margin-bottom: 12px; }
    .ins { border-radius: 9px; padding: 8px; background: var(--nx-surface-0); border: 1px solid var(--nx-line); text-align: center; }
    .ins b { display: block; font: 600 11px var(--nx-font-mono); text-transform: uppercase; color: var(--nx-text); }
    .ins small { font: 500 8.5px var(--nx-font-mono); letter-spacing: .08em; text-transform: uppercase; color: var(--nx-text-dim); }
    .ins.paid { border-color: rgba(43,209,126,.35); }
    .ins.paid small { color: var(--nx-win); }
    .ins.late { border-color: rgba(255,59,48,.55); background: rgba(255,59,48,.06); }
    .ins.late small { color: var(--nx-live); }
    .ins.open { border-color: rgba(244,197,67,.45); }
    .ins.open small { color: var(--nx-pending); }
    .ins.link { border-color: rgba(255,106,26,.55); background: rgba(255,106,26,.06); }
    .ins.link small { color: var(--nx-orange-400); }
    .banner { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 12px; padding: 12px 14px; border-radius: 12px; background: rgba(255,106,26,.06); border: 1px solid rgba(255,106,26,.35); }
    .chart { display: grid; grid-template-columns: repeat(6, 1fr); gap: 10px; align-items: end; height: 140px; margin-top: 14px; border-bottom: 1px solid var(--nx-line); }
    .col-bar { display: flex; flex-direction: column; justify-content: flex-end; gap: 2px; height: 100%; }
    .col-bar i { display: block; border-radius: 4px; min-height: 3px; }
    .col-bar .p { background: var(--nx-win); }
    .col-bar .a { background: rgba(255,106,26,.55); }
    .n { font: 10px var(--nx-font-mono); text-align: center; color: var(--nx-text-mute); margin-bottom: 4px; }
    .months { display: grid; grid-template-columns: repeat(6, 1fr); gap: 10px; margin-top: 6px; }
    .months span { font: 9.5px var(--nx-font-mono); letter-spacing: .1em; text-transform: uppercase; text-align: center; color: var(--nx-text-dim); }
    .legend { display: flex; gap: 14px; font-size: 11.5px; color: var(--nx-text-dim); margin-top: 12px; }
    .legend span { display: inline-flex; gap: 6px; align-items: center; }
    .sw { width: 10px; height: 10px; border-radius: 2px; }
    .sw.p { background: var(--nx-win); }
    .sw.a { background: rgba(255,106,26,.55); }
    .insight { display: flex; gap: 10px; align-items: flex-start; padding: 12px 14px; border-radius: 10px; background: rgba(244,197,67,.06); border: 1px solid rgba(244,197,67,.3); font-size: 12.5px; color: var(--nx-text-mute); line-height: 1.5; margin-top: 14px; color: var(--nx-pending); }
    .insight span { color: var(--nx-text-mute); }
    .kv { display: flex; justify-content: space-between; gap: 10px; font-size: 12.5px; padding: 7px 0; color: var(--nx-text-mute); border-bottom: 1px solid var(--nx-line); }
    .kv b { color: var(--nx-text); font: 600 12px var(--nx-font-mono); text-align: right; }
    .kv b.red { color: var(--nx-live); }
    .outs { display: flex; flex-wrap: wrap; gap: 6px; margin: 12px 0 10px; }
    .out { min-height: 32px; padding: 0 10px; border-radius: 999px; border: 1px solid var(--nx-line-strong); background: var(--nx-surface-0); color: var(--nx-text-mute); font: 600 11.5px var(--nx-font-ui); cursor: pointer; }
    .out.on { border-color: rgba(255,106,26,.55); color: var(--nx-orange-400); background: rgba(255,106,26,.1); }
    .seg { display: flex; padding: 3px; border-radius: 10px; background: var(--nx-surface-0); border: 1px solid var(--nx-line); margin-bottom: 10px; }
    .seg button { flex: 1; padding: 6px 4px; border-radius: 8px; font: 600 11px var(--nx-font-ui); color: var(--nx-text-mute); background: none; border: none; cursor: pointer; }
    .seg button.on { background: var(--nx-surface-2); color: var(--nx-text); }
    .field-l { display: block; font-size: 12px; font-weight: 600; color: var(--nx-text); margin-bottom: 6px; }
    .input { width: 100%; box-sizing: border-box; height: 40px; border-radius: 10px; background: var(--nx-surface-0); border: 1px solid var(--nx-line-strong); color: var(--nx-text); font: 13px var(--nx-font-ui); padding: 0 12px; }
    .input.area { height: 70px; padding: 10px 12px; resize: vertical; margin-bottom: 10px; }
    .tl { list-style: none; margin: 12px 0 0; padding: 0; display: flex; flex-direction: column; gap: 14px; }
    .tl li { display: flex; gap: 10px; }
    .dot { width: 8px; height: 8px; border-radius: 50%; margin-top: 5px; flex: none; background: var(--nx-orange-500); }
    .dot.green { background: var(--nx-win); }
    .dot.red { background: var(--nx-live); }
    .dot.dim { background: #9AA0A6; }
    .tl-w { font: 10px var(--nx-font-mono); color: var(--nx-text-dim); }
    .tl-t { font-size: 12.5px; margin-top: 2px; line-height: 1.45; color: var(--nx-text); }
    @include ar.below(md) {
      .d-body { grid-template-columns: minmax(0, 1fr); }
      .grid4 { grid-template-columns: 1fr 1fr; }
    }
  `,
})
export class CrmCustomerDrawerComponent {
  readonly customerKey = input.required<string>();

  protected readonly store = inject(CrmStore);
  protected readonly ui = inject(CrmUiService);

  protected readonly periodLabel = PERIOD_LABEL;
  protected readonly statusText = STATUS_LABEL;
  protected readonly outcomes = OUTCOMES;
  protected readonly channels: CrmContactChannel[] = ['whatsapp', 'call', 'in_person', 'note'];
  protected readonly channelLabel = CHANNEL_LABEL;
  protected readonly stateLabel = { paid: 'Pago', late: 'Atrasada', open: 'A vencer', future: 'Futura', link: 'No link' };
  protected readonly canCharge = canChargeOnline;
  protected readonly money = money;
  protected readonly monthShort = monthShort;
  protected readonly dayMonth = dayMonth;
  protected readonly shortDate = shortDate;
  protected readonly patternLabel = patternLabel;
  protected readonly hoursLabel = hoursLabel;
  protected readonly usage = computed(() => {
    const c = this.customer();
    return c ? weekUsage(c) : null;
  });

  /** Barra da semana: a borda de cima (tracejada) é o contratado; acima disso, passa um pouco. */
  protected weekBar(hours: number, contracted: number): number {
    return contracted > 0 ? Math.min(100, Math.round((hours / contracted) * 100)) : 0;
  }

  protected weeksLabel(c: CrmCustomer, contracted: number): string {
    return `Horas por semana, contratado ${hoursLabel(contracted)}: ` + (c.weekHours ?? []).map((h) => hoursLabel(h)).join(', ');
  }
  protected readonly label = statusLabel;
  protected readonly tone = statusTone;

  protected readonly detail = signal<CrmCustomerDetail | null>(null);
  protected readonly loadingDetail = signal(true);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly canceling = signal(false);
  protected readonly cancelReason = signal('');
  protected readonly outcome = signal<CrmContactOutcome | null>(null);
  protected readonly channel = signal<CrmContactChannel>('whatsapp');
  protected readonly note = signal('');

  protected readonly customer = computed(() => this.store.byKey().get(this.customerKey()) ?? null);
  /** Contrato registrado pelo CRM (o de Planos de horário é gerido na tela dele). */
  protected readonly ownContract = computed(() => {
    const v = this.customer()?.contract;
    return v?.source === 'contract' ? v : null;
  });
  protected readonly strip = computed(() => {
    const v = this.customer()?.contract;
    return v ? installmentStrip(v, this.store.today()) : [];
  });
  protected readonly insight = computed(() => {
    const c = this.customer();
    return c ? customerInsight(c, this.store.today()) : null;
  });
  private readonly maxMonth = computed(() => Math.max(1, ...(this.customer()?.months.map((m) => m.total) ?? [1])));

  protected readonly timeline = computed<TimelineEntry[]>(() => {
    const d = this.detail();
    if (!d) return [];
    const out: Array<TimelineEntry & { sort: string }> = [];
    for (const k of d.contacts) {
      out.push({
        sort: k.at,
        at: dayMonth(k.at.slice(0, 10)),
        who: k.byName ?? 'Equipe',
        text: `${CHANNEL_LABEL[k.channel]} · ${OUTCOME_LABEL[k.outcome]}${k.note ? ` — ${k.note}` : ''}`,
        tone: k.outcome === 'converted' || k.outcome === 'promised_payment' ? 'green' : k.outcome === 'declined' ? 'red' : 'orange',
      });
    }
    for (const p of d.payments) {
      const method = paymentMethodLabel(p.method);
      out.push({ sort: `${p.paidOn}T23`, at: dayMonth(p.paidOn), who: method, text: `Pagamento de ${p.installments} ${p.installments === 1 ? 'parcela' : 'parcelas'} · ${money(p.amountReais)}`, tone: 'green' });
    }
    for (const r of d.reminders ?? []) {
      out.push({ sort: r.sentAt, at: dayMonth(r.sentAt.slice(0, 10)), who: 'Lembrete automático', text: `Push · ${REMINDER_LABEL[r.kind]}`, tone: 'dim' });
    }
    for (const c of d.contracts) {
      out.push({ sort: `${c.startDate}T00`, at: dayMonth(c.startDate), who: 'Contrato', text: `${c.renewedFromId ? 'Renovação' : 'Contrato'} ${c.planName} · ${PERIOD_LABEL[c.period]} · ${money(c.monthlyPriceReais)}/mês`, tone: 'dim' });
      if (c.canceledOn) out.push({ sort: `${c.canceledOn}T12`, at: dayMonth(c.canceledOn), who: 'Contrato', text: `Cancelado${c.cancelReason ? ` — ${c.cancelReason}` : ''}`, tone: 'red' });
    }
    return out.sort((a, b) => b.sort.localeCompare(a.sort)).slice(0, 30).map(({ sort: _s, ...e }) => e);
  });

  constructor() {
    effect(() => {
      const key = this.customerKey();
      // Recarrega a ficha quando a visão geral muda (depois de pagar, renovar, registrar contato).
      this.store.overview();
      void this.loadDetail(key);
    });
  }

  private async loadDetail(key: string): Promise<void> {
    try {
      const d = await this.store.customerDetail(key);
      if (key === this.customerKey()) this.detail.set(d);
    } catch {
      this.detail.set(null);
    } finally {
      this.loadingDetail.set(false);
    }
  }

  protected meta(c: CrmCustomer): string {
    const since = [c.firstDate, c.contract?.startDate].filter((d): d is string => !!d).sort()[0];
    const parts = [`Cliente desde ${monthYear(since)}`, `${c.bookings6m} jogos em 6 meses`];
    if (c.avulsoReais6m > 0) parts.push(`${money(c.avulsoReais6m)} em avulso`);
    return parts.join(' · ');
  }

  protected phone(c: CrmCustomer): string {
    return formatPhone(c.phone) ?? 'Sem telefone';
  }

  protected ago(c: CrmCustomer): string {
    const d = c.daysSinceVisit ?? 0;
    return d <= 0 ? 'hoje' : d === 1 ? 'ontem' : `há ${d} dias`;
  }

  protected pad(n: number): string {
    return String(n).padStart(2, '0');
  }

  protected h(n: number): number {
    return Math.max(4, (n / this.maxMonth()) * 82);
  }

  protected chartLabel(c: CrmCustomer): string {
    return `Jogos por mês: ${c.months.map((m) => `${monthShort(m.month)} ${m.total}`).join(', ')}`;
  }

  protected waHint(c: CrmCustomer): string {
    const reason = profileReason(c);
    return reason === 'overdue' ? ' · cobrança' : reason === 'renewal' ? ' · renovação' : reason === 'offer' ? ' · oferta' : '';
  }

  protected whatsapp(c: CrmCustomer): void {
    void this.ui.whatsapp(c, profileMessage(c, this.store.arenaName()), profileReason(c));
  }

  protected edit(c: CrmCustomer): void {
    const v = this.ownContract();
    const h = this.detail()?.contracts.find((x) => x.id === v?.id);
    if (!v) return;
    this.ui.contractForm.set({
      mode: 'edit',
      customer: c,
      contractId: v.id,
      prefill: {
        planId: v.planId, planName: v.planName, period: v.period, dueDay: v.dueDay, weeklyHours: v.weeklyHours,
        monthlyPriceReais: v.monthlyPriceReais, startDate: v.startDate, autoRenew: v.autoRenew, note: v.note,
        customerName: h?.customerName ?? c.name, customerPhone: h?.customerPhone ?? c.phone,
      },
    });
  }

  protected renew(c: CrmCustomer): void {
    const v = this.ownContract();
    if (!v) return;
    this.ui.contractForm.set({
      mode: 'renew',
      customer: c,
      contractId: v.id,
      prefill: { planId: v.planId, planName: v.planName, period: v.period, dueDay: v.dueDay, weeklyHours: v.weeklyHours, monthlyPriceReais: v.monthlyPriceReais, autoRenew: v.autoRenew },
    });
  }

  protected async copyLink(url: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(url);
      this.ui.flash('Link copiado.');
    } catch {
      this.ui.flash('Não foi possível copiar.');
    }
  }

  protected async cancelLink(): Promise<void> {
    const v = this.ownContract();
    if (!v) return;
    await this.run(async () => {
      await this.store.cancelPaymentLink(v.id);
      this.ui.flash('Link cancelado.');
    });
  }

  protected async cancel(): Promise<void> {
    const v = this.ownContract();
    if (!v) return;
    await this.run(async () => {
      await this.store.cancelContract(v.id, this.cancelReason().trim());
      this.canceling.set(false);
      this.ui.flash('Contrato cancelado.');
    });
  }

  protected async saveContact(c: CrmCustomer): Promise<void> {
    const outcome = this.outcome();
    if (!outcome) return;
    await this.run(async () => {
      await this.store.logContact(c, profileReason(c), outcome, this.channel(), this.note().trim() || null);
      this.outcome.set(null);
      this.note.set('');
      this.ui.flash('Contato registrado.');
    });
  }

  private async run(fn: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await fn();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Não foi possível concluir.');
    } finally {
      this.busy.set(false);
    }
  }
}
