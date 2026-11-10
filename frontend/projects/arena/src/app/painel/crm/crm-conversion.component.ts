import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AvatarComponent } from '../ui/avatar.component';
import {
  CONVERT_MIN_WEEKS,
  OFFER_TEMPLATES,
  contactLine,
  money,
  monthShort,
  monthYear,
  offerMessage,
  patternLabel,
  type CrmCustomer,
  type OfferTemplate,
} from './crm.model';
import { CrmUiService } from './crm-ui.service';
import { CrmStore } from './crm.store';

/** Aba Conversão: funil de 90 dias, mapa de calor das reservas por mês e a oferta pronta. */
@Component({
  selector: 'ar-crm-conversion',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AvatarComponent],
  styleUrls: ['./crm.scss'],
  template: `
    @if (store.overview(); as o) {
      <section class="funnel" aria-label="Funil dos últimos 90 dias">
        <div class="st"><div class="label">Jogaram avulso</div><div class="st-v">{{ o.kpis.funnel.walkIns }}</div><div class="sub">clientes em 90 dias</div><div class="bar"><i [style.width.%]="100"></i></div></div>
        <div class="st"><div class="label">Frequentes</div><div class="st-v">{{ o.kpis.funnel.frequent }}</div><div class="sub">{{ minWeeks }}+ semanas jogando</div><div class="bar"><i [style.width.%]="share(o.kpis.funnel.frequent)"></i></div></div>
        <div class="st"><div class="label">Receberam oferta</div><div class="st-v">{{ o.kpis.funnel.offered }}</div><div class="sub">pelo CRM</div><div class="bar"><i [style.width.%]="share(o.kpis.funnel.offered)"></i></div></div>
        <div class="st win"><div class="label">Viraram mensalista</div><div class="st-v good">{{ o.kpis.funnel.converted }}</div><div class="sub"><b class="good">+{{ money(o.kpis.funnel.convertedReais) }}/mês</b> recorrente</div><div class="bar"><i class="g" [style.width.%]="share(o.kpis.funnel.converted)"></i></div></div>
      </section>

      <div class="cols">
        <section class="card table-card" aria-labelledby="opp-t">
          <div class="c-h">
            <div>
              <h2 class="card-title" id="opp-t">Avulsos frequentes</h2>
              <p class="card-desc">Reservas por mês e o horário que se repete. Primeiro, quem mais se parece com um mensalista.</p>
            </div>
            <div class="seg" role="group" aria-label="Mostrar">
              <button type="button" [class.on]="!all()" (click)="all.set(false)">Prontos · {{ o.queues.convert.length }}</button>
              <button type="button" [class.on]="all()" (click)="all.set(true)">Todos os avulsos · {{ walkIns().length }}</button>
            </div>
          </div>
          <div class="ar-table-scroll">
            <div class="table">
              <div class="tr th">
                <span>Cliente</span>
                @for (m of months(); track m) { <span class="m">{{ monthShort(m) }}</span> }
                <span>Padrão</span><span>Gasta/mês</span><span>Plano sugerido</span><span></span>
              </div>
              @for (c of rows(); track c.key) {
                <div class="tr" [class.sel]="selected()?.key === c.key">
                  <button type="button" class="who" (click)="pick(c)">
                    <ar-avatar [name]="c.name" [photoUrl]="c.photoUrl" [size]="34" />
                    <span class="who-t"><span class="name">{{ c.name }}</span><span class="sub">desde {{ monthYear(c.firstDate) }}</span></span>
                  </button>
                  @for (m of c.months; track m.month) {
                    <span class="heat" [class]="'heat h' + heat(m.avulso)">{{ m.avulso }}</span>
                  }
                  <span>
                    @if (c.pattern.length) {
                      <span class="pattern">{{ patternLabel(c.pattern) }}</span>
                      <span class="sub reg">{{ hits(c) }} das últimas 8 semanas</span>
                    } @else { <span class="sub">sem horário fixo</span> }
                  </span>
                  <span class="money">{{ money(avg(c)) }}</span>
                  <span>
                    @if (c.conversion?.suggestion; as s) {
                      <span class="name sm">{{ s.planName }} · {{ money(s.monthlyPriceReais) }}</span>
                      <span class="sub" [class.good]="s.savingsReais > 0" [class.warn]="s.savingsReais <= 0">{{ s.savingsReais > 0 ? 'economiza ' + money(round(s.savingsReais)) + '/mês' : 'garante o horário' }}</span>
                    } @else { <span class="sub">—</span> }
                  </span>
                  <span class="act">
                    @if (c.lastContact?.reason === 'offer') {
                      <button type="button" class="btn" (click)="pick(c)">Ofertado</button>
                      <span class="sub tiny">{{ contactLine(c.lastContact, store.today()) }}</span>
                    } @else {
                      <button type="button" class="btn primary" (click)="pick(c)">Oferecer</button>
                    }
                  </span>
                </div>
              } @empty {
                <p class="state pad">{{ all() ? 'Nenhum avulso nos últimos 6 meses.' : 'Ninguém pronto ainda: avulso com 6+ reservas em 90 dias e 4+ semanas ativas aparece aqui.' }}</p>
              }
            </div>
          </div>
        </section>

        <section class="preview" aria-labelledby="wa-t">
          @if (selected(); as c) {
            <div class="wa">
              <div class="wa-h">
                <ar-avatar [name]="c.name" [photoUrl]="c.photoUrl" [size]="36" />
                <div><div class="name" id="wa-t">{{ c.name }}</div><div class="sub">Prévia da mensagem</div></div>
              </div>
              <div class="bubble">{{ message() }}</div>
              <div class="tpl" role="group" aria-label="Modelo da mensagem">
                @for (t of templates; track t.id) {
                  <button type="button" [class.on]="template() === t.id" [attr.aria-pressed]="template() === t.id" (click)="template.set(t.id)">{{ t.label }}</button>
                }
              </div>
            </div>
            <div class="send">
              <button type="button" class="btn primary lg grow" [disabled]="!c.whatsapp" (click)="send(c)">{{ c.whatsapp ? 'Abrir no WhatsApp' : 'Sem telefone cadastrado' }}</button>
              <button type="button" class="btn lg" (click)="copy()">{{ copied() ? 'Copiado' : 'Copiar' }}</button>
            </div>
            @if (ui.canWrite()) {
              <button type="button" class="btn lg wide" (click)="ui.contractFromOffer(c)">Fechou? Criar contrato</button>
            }
            <p class="card-desc">Ao abrir, o CRM registra a oferta. Se fechar, o contrato nasce com o plano e o valor preenchidos.</p>
          } @else {
            <div class="card"><p class="state">Escolha um cliente para ver a oferta pronta.</p></div>
          }
        </section>
      </div>
    }
  `,
  styles: `
    @use 'breakpoints' as ar;
    :host { display: flex; flex-direction: column; gap: 18px; }
    .funnel { display: grid; grid-template-columns: repeat(4, 1fr); background: var(--nx-surface-0); border: 1px solid var(--nx-line); border-radius: 16px; overflow: hidden; }
    .st { padding: 18px 20px; border-right: 1px solid var(--nx-line); }
    .st:last-child { border-right: none; }
    .st.win { background: radial-gradient(120% 140% at 100% 0%, rgba(43,209,126,.16), rgba(43,209,126,0) 60%); }
    .st-v { font-family: var(--nx-font-display); font-weight: 700; font-size: 30px; margin: 6px 0 4px; color: var(--nx-text); }
    .bar { height: 6px; border-radius: 6px; background: var(--nx-surface-2); margin-top: 12px; overflow: hidden; }
    .bar i { display: block; height: 100%; background: var(--nx-orange-500); }
    .bar i.g { background: var(--nx-win); }
    .cols { display: grid; grid-template-columns: minmax(0, 1fr) 380px; gap: 18px; align-items: start; }
    .table-card { padding: 0; overflow: hidden; }
    .c-h { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 18px 20px; border-bottom: 1px solid var(--nx-line); flex-wrap: wrap; }
    .seg { display: inline-flex; padding: 3px; border-radius: 10px; background: var(--nx-surface-1); border: 1px solid var(--nx-line); }
    .seg button { padding: 7px 12px; border-radius: 8px; font: 600 12.5px var(--nx-font-ui); color: var(--nx-text-mute); background: none; border: none; cursor: pointer; }
    .seg button.on { background: var(--nx-orange-500); color: var(--nx-text-on-orange); }
    .table { min-width: 1000px; }
    .tr { display: grid; grid-template-columns: minmax(170px, 1.4fr) repeat(6, 46px) minmax(0, 1fr) 80px minmax(0, 1.2fr) 104px; gap: 10px; align-items: center; padding: 11px 18px; border-bottom: 1px solid var(--nx-line); }
    .tr.sel { background: rgba(255,106,26,.05); box-shadow: inset 2px 0 0 var(--nx-orange-500); }
    .th span { font-family: var(--nx-font-mono); font-size: 9px; letter-spacing: .14em; text-transform: uppercase; color: var(--nx-text-dim); }
    .th .m { text-align: center; }
    .who { display: flex; align-items: center; gap: 10px; min-width: 0; background: none; border: none; padding: 0; color: inherit; font: inherit; text-align: left; cursor: pointer; }
    .who-t { display: flex; flex-direction: column; min-width: 0; }
    .name.sm { font-size: 12.5px; display: block; }
    .heat { display: flex; align-items: center; justify-content: center; height: 30px; border-radius: 7px; font: 600 12px var(--nx-font-mono); }
    .h0 { background: var(--nx-surface-1); color: var(--nx-text-dim); }
    .h1 { background: rgba(255,106,26,.16); color: #FFB287; }
    .h2 { background: rgba(255,106,26,.34); color: #FFD2B8; }
    .h3 { background: rgba(255,106,26,.6); color: #fff; }
    .h4 { background: var(--nx-orange-500); color: var(--nx-text-on-orange); }
    .reg { display: block; font-size: 11px; }
    .act { display: flex; flex-direction: column; gap: 4px; align-items: flex-start; }
    .tiny { font-size: 10.5px; }
    .pad { padding: 18px; }
    .wa { background: #0B141A; border: 1px solid var(--nx-line); border-radius: 16px; padding: 16px; }
    .wa-h { display: flex; gap: 10px; align-items: center; padding-bottom: 12px; border-bottom: 1px solid var(--nx-line); }
    .bubble { background: #005C4B; color: #E9EDEF; border-radius: 10px 10px 2px 10px; padding: 10px 12px; font-size: 13px; line-height: 1.5; margin: 14px 0 0 30px; white-space: pre-wrap; }
    .tpl { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 12px; }
    .tpl button { min-height: 30px; padding: 0 10px; border-radius: 999px; border: 1px solid var(--nx-line-strong); background: var(--nx-surface-1); color: var(--nx-text-mute); font: 600 11.5px var(--nx-font-ui); cursor: pointer; }
    .tpl button.on { border-color: rgba(255,106,26,.55); color: var(--nx-orange-400); background: rgba(255,106,26,.1); }
    .send { display: flex; gap: 10px; margin-top: 12px; }
    .grow { flex: 1; }
    .wide { width: 100%; margin-top: 10px; }
    .preview .card-desc { margin-top: 10px; }
    @include ar.below(lg) {
      .cols { grid-template-columns: minmax(0, 1fr); }
    }
    @include ar.below(md) {
      .funnel { grid-template-columns: 1fr 1fr; }
    }
  `,
})
export class CrmConversionComponent {
  protected readonly store = inject(CrmStore);
  protected readonly ui = inject(CrmUiService);

  protected readonly templates = OFFER_TEMPLATES;
  protected readonly minWeeks = CONVERT_MIN_WEEKS;
  protected readonly money = money;
  protected readonly monthShort = monthShort;
  protected readonly monthYear = monthYear;
  protected readonly patternLabel = patternLabel;
  protected readonly contactLine = contactLine;
  protected readonly round = Math.round;

  protected readonly all = signal(false);
  protected readonly template = signal<OfferTemplate>('savings');
  protected readonly selectedKey = signal<string | null>(null);
  protected readonly copied = signal(false);

  protected readonly months = computed(() => this.store.customers()[0]?.months.map((m) => m.month) ?? []);

  protected readonly walkIns = computed(() =>
    this.store.customers()
      .filter((c) => c.kind !== 'member' && c.months.some((m) => m.avulso > 0))
      .sort((a, b) => avulsoTotal(b) - avulsoTotal(a)),
  );

  protected readonly rows = computed(() => {
    if (this.all()) return this.walkIns().slice(0, 200);
    const byKey = this.store.byKey();
    return (this.store.overview()?.queues.convert ?? []).map((i) => byKey.get(i.key)).filter((c): c is CrmCustomer => !!c);
  });

  protected readonly selected = computed<CrmCustomer | null>(() => {
    const key = this.selectedKey();
    return (key ? this.store.byKey().get(key) : undefined) ?? this.rows()[0] ?? null;
  });

  protected readonly message = computed(() => {
    const c = this.selected();
    return c ? offerMessage(c, this.store.arenaName(), this.template()) : '';
  });

  private readonly funnelTop = computed(() => Math.max(1, this.store.overview()?.kpis.funnel.walkIns ?? 1));

  protected share(n: number): number {
    return Math.max(n > 0 ? 3 : 0, (n / this.funnelTop()) * 100);
  }

  protected heat(n: number): number {
    return n <= 0 ? 0 : n <= 1 ? 1 : n <= 3 ? 2 : n <= 5 ? 3 : 4;
  }

  protected hits(c: CrmCustomer): number {
    return c.weekHits.filter(Boolean).length;
  }

  protected avg(c: CrmCustomer): number {
    if (c.conversion) return c.conversion.avgMonthlyReais;
    const last3 = c.months.slice(-3);
    return Math.round(last3.reduce((s, m) => s + m.avulsoReais, 0) / 3);
  }

  protected pick(c: CrmCustomer): void {
    this.selectedKey.set(c.key);
    this.copied.set(false);
  }

  protected send(c: CrmCustomer): void {
    void this.ui.whatsapp(c, this.message(), 'offer');
  }

  protected async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.message());
      this.copied.set(true);
    } catch {
      this.ui.flash('Não foi possível copiar. Selecione o texto e copie.');
    }
  }
}

function avulsoTotal(c: CrmCustomer): number {
  return c.months.reduce((s, m) => s + m.avulso, 0);
}
