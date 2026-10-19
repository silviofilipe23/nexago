import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { brl } from '../../planos/data/tournament-plans';
import { CONTRACT_STATUS_VIEW, dayLabel, dayRangeLabel, type PlanContract } from '../data/plan-contracts';
import type { OrganizerContact } from '../data/plan-contracts.repository';

const DATE_TIME = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

type PayState = { text: string; tone: 'ok' | 'wait' | 'late' | 'dim' };

/** Coluna do detalhe: contas do contrato (marcadas à mão), evento + contato do organizador e histórico. */
@Component({
  selector: 'bo-contract-side',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let c = contract();
    <section class="card">
      <h2>Pagamento</h2>
      <div class="total"><span>Total do plano</span><b>{{ brl(c.priceCents) }}</b></div>
      <div class="line">
        <div><span class="k">Sinal · {{ c.plan.depositPct }}%</span><b>{{ brl(c.depositCents) }}</b></div>
        <span [class]="'state ' + deposit().tone">{{ deposit().text }}</span>
      </div>
      <div class="line">
        <div><span class="k">Saldo · vence {{ c.balanceDueDate ? day(c.balanceDueDate) : '—' }}</span><b>{{ brl(c.balanceCents) }}</b></div>
        <span [class]="'state ' + balance().tone">{{ balance().text }}</span>
      </div>
      <p class="note">Sem cobrança online: combine o Pix com o organizador e marque aqui quando o valor cair.</p>
    </section>

    <section class="card">
      <h2>Evento</h2>
      <dl>
        <dt>Datas</dt><dd>{{ range() }}</dd>
        <dt>Cidade</dt><dd>{{ c.city || '—' }}</dd>
        <dt>Pedido em</dt><dd>{{ c.createdAt ? dateTime(c.createdAt) : '—' }}</dd>
        <dt>Organizador</dt>
        <dd>
          {{ contact()?.orgName || c.organizerName }}
          @if (contact()?.orgName && contact()?.orgName !== c.organizerName) { <span class="sub">{{ c.organizerName }}</span> }
        </dd>
        @if (contact()?.email; as email) { <dt>E-mail</dt><dd><a [href]="'mailto:' + email">{{ email }}</a></dd> }
        @if (contact()?.phone; as phone) {
          <dt>Telefone</dt>
          <dd>{{ phone }} @if (whatsapp(); as w) { · <a [href]="w" target="_blank" rel="noopener">WhatsApp</a> }</dd>
        }
      </dl>
    </section>

    <section class="card">
      <h2>Histórico</h2>
      <ol class="history">
        @for (h of history(); track $index) {
          <li>
            <span [class]="'dot ' + h.status"></span>
            <div>
              <strong>{{ label(h.status) }}</strong>
              <span class="sub">{{ h.at ? dateTime(h.at) : '—' }}{{ h.by ? ' · ' + h.by : '' }}</span>
              @if (h.note) { <span class="hnote">{{ h.note }}</span> }
            </div>
          </li>
        } @empty {
          <li class="sub">Sem registros.</li>
        }
      </ol>
    </section>
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 16px; }
    .card { padding: 20px 22px; background: var(--nx-surface-0); border: 1px solid var(--nx-line); border-radius: var(--nx-r-4); }
    h2 { margin: 0 0 14px; font-family: var(--nx-font-display); font-weight: 800; font-size: 15px; }
    .total { display: flex; justify-content: space-between; align-items: baseline; padding-bottom: 12px; border-bottom: 1px solid var(--nx-line); font-size: 12.5px; color: var(--nx-text-mute); }
    .total b { font-family: var(--nx-font-display); font-weight: 800; font-size: 22px; color: var(--nx-text); }
    .line { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 12px 0; border-bottom: 1px solid var(--nx-line); }
    .line > div { display: flex; flex-direction: column; gap: 3px; }
    .k { font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: var(--nx-text-dim); }
    .line b { font-family: var(--nx-font-display); font-weight: 800; font-size: 15px; }
    .state { font-size: 12px; font-weight: 600; text-align: right; }
    .state.ok { color: var(--nx-win); }
    .state.wait { color: var(--nx-orange-500); }
    .state.late { color: var(--nx-live); }
    .state.dim { color: var(--nx-text-dim); font-weight: 500; }
    .note { margin: 12px 0 0; font-size: 11.5px; line-height: 1.45; color: var(--nx-text-dim); }
    dl { margin: 0; display: grid; grid-template-columns: 96px minmax(0, 1fr); gap: 9px 12px; font-size: 12.5px; }
    dt { color: var(--nx-text-dim); }
    dd { margin: 0; min-width: 0; overflow-wrap: anywhere; display: flex; flex-direction: column; gap: 2px; }
    a { color: var(--nx-orange-500); text-decoration: none; }
    a:hover { text-decoration: underline; }
    .sub { font-size: 11.5px; color: var(--nx-text-dim); }
    .history { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 14px; }
    .history li { display: flex; gap: 12px; }
    .history li > div { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .history strong { font-family: var(--nx-font-display); font-weight: 700; font-size: 13px; }
    .hnote { font-size: 12px; color: var(--nx-text-mute); overflow-wrap: anywhere; }
    .dot { flex: none; width: 10px; height: 10px; margin-top: 4px; border-radius: 50%; background: var(--nx-line-strong); }
    .dot.requested { background: var(--nx-orange-500); }
    .dot.deposit_paid { background: var(--nx-pending); }
    .dot.paid, .dot.completed { background: var(--nx-win); }
    .dot.cancelled { background: var(--nx-live); }
  `,
})
export class ContractSideComponent {
  readonly contract = input.required<PlanContract>();
  readonly contact = input<OrganizerContact | null>(null);
  readonly today = input.required<string>();

  protected readonly brl = brl;
  protected readonly range = computed(() => dayRangeLabel(this.contract().startDate, this.contract().endDate));
  /** Mais recente primeiro. */
  protected readonly history = computed(() => [...this.contract().history].reverse());

  protected readonly deposit = computed<PayState>(() => {
    const c = this.contract();
    const at = c.history.find((h) => h.status === 'deposit_paid')?.at;
    if (c.depositCents === 0) return { text: 'Sem sinal', tone: 'dim' };
    if (at) return { text: `Recebido ${this.shortDate(at)}`, tone: 'ok' };
    if (c.status === 'requested') return { text: 'Aguardando', tone: 'wait' };
    return { text: c.status === 'cancelled' ? 'Não pago' : '—', tone: 'dim' };
  });

  protected readonly balance = computed<PayState>(() => {
    const c = this.contract();
    const at = c.history.find((h) => h.status === 'paid')?.at;
    if (c.balanceCents === 0) return { text: 'Sem saldo', tone: 'dim' };
    if (at) return { text: `Recebido ${this.shortDate(at)}`, tone: 'ok' };
    if (c.status === 'cancelled') return { text: 'Não pago', tone: 'dim' };
    if (c.status === 'requested') return { text: 'Depois do sinal', tone: 'dim' };
    return c.balanceDueDate && c.balanceDueDate < this.today()
      ? { text: 'Vencido', tone: 'late' }
      : { text: 'A receber', tone: 'wait' };
  });

  /** Só celular BR (DDD + 9 dígitos): o link abre a conversa direto. */
  protected readonly whatsapp = computed(() => {
    const digits = (this.contact()?.phone ?? '').replace(/\D+/g, '');
    const local = digits.startsWith('55') && digits.length === 13 ? digits.slice(2) : digits;
    return local.length === 11 ? `https://wa.me/55${local}` : null;
  });

  protected label(s: PlanContract['status']): string {
    return CONTRACT_STATUS_VIEW[s].label;
  }
  protected day(d: string): string {
    return dayLabel(d);
  }
  protected dateTime(d: Date): string {
    return DATE_TIME.format(d).replace(',', ' ·');
  }
  private shortDate(d: Date): string {
    return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' });
  }
}
