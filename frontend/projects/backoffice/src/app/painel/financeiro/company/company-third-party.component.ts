import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { PanelCardComponent } from '../../ui/panel-card.component';
import { PillComponent } from '../../ui/pill.component';
import {
  THIRD_PARTY_LABEL,
  THIRD_PARTY_ORDER,
  holderName,
  inAccountCents,
  money,
  type CompanyFinance,
} from '../data/company-finance';

const DATE = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' });

const KIND_PLURAL: Record<string, [string, string]> = {
  tournaments: ['torneio', 'torneios'],
  organizersLegacy: ['carteira', 'carteiras'],
  arenas: ['arena', 'arenas'],
  professors: ['professor', 'professores'],
  squad: ['embaixador', 'embaixadores'],
};

/** De quem é cada real na conta (caixas, carteiras, saques) e o que a NexaGO ainda vai bancar. */
@Component({
  selector: 'bo-company-third-party',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelCardComponent, PillComponent],
  template: `
    <div class="cards">
      <bo-panel-card title="Dinheiro de terceiros na conta">
        <strong card-actions class="total">{{ money(data().balance.thirdPartyCents) }}</strong>
        <div class="grid head"><span>De quem</span><span class="r">Disponível</span><span class="r">Em saque</span><span class="r">Total</span></div>
        @for (k of order; track k) {
          @let h = data().thirdParty[k];
          <div class="grid">
            <span>{{ label[k] }}@if (h.count) { <span class="dim"> · {{ h.count }} {{ h.count === 1 ? plural[k][0] : plural[k][1] }}</span> }</span>
            <span class="num" [class.dim]="!h.availableCents">{{ h.availableCents ? money(h.availableCents) : '—' }}</span>
            <span class="num" [class.dim]="!h.pendingCents">{{ h.pendingCents ? money(h.pendingCents) : '—' }}</span>
            <span class="num" [class.dim]="!inAccount(h)">{{ inAccount(h) ? money(inAccount(h)) : '—' }}</span>
          </div>
        }
        @if (data().awaitingCents > 0) {
          <p class="note">Fora da conta ainda: {{ money(data().awaitingCents) }} em cartões aprovados a liberar (entram nos caixas na liquidação).</p>
        }
      </bo-panel-card>

      <bo-panel-card title="Provisões">
        <strong card-actions class="total">{{ money(data().balance.provisionsCents) }}</strong>
        <div class="grid two head"><span>O que a nexaGO ainda vai bancar</span><span class="r">Valor</span></div>
        <div class="grid two">
          <span>Cashback dos atletas <span class="dim">· {{ money(p().cashbackAvailableCents) }} liberado + {{ money(p().cashbackPendingCents) }} a liberar</span></span>
          <span class="num">{{ money(p().cashbackAvailableCents + p().cashbackPendingCents) }}</span>
        </div>
        <div class="grid two">
          <span>Comissões Squad a repassar <span class="dim">· {{ p().squadToPayCount }} {{ p().squadToPayCount === 1 ? 'comissão liberada' : 'comissões liberadas' }}</span></span>
          <span class="num">{{ money(p().squadToPayCents) }}</span>
        </div>
        <div class="grid two">
          <span>Devoluções da loja pendentes <span class="dim">· {{ p().storeRefundsCount }} {{ p().storeRefundsCount === 1 ? 'pedido' : 'pedidos' }}</span></span>
          <span class="num">{{ money(p().storeRefundsCents) }}</span>
        </div>
        <p class="note">Cashback não sai em dinheiro: vira desconto quando o atleta usa e vence se não for usado.</p>
      </bo-panel-card>
    </div>

    <bo-panel-card title="Maiores saldos guardados" kicker="Quem pode sacar a qualquer momento">
      <div class="grid who head"><span>Caixa</span><span class="r">Tipo</span><span class="r">Em saque</span><span class="r">Saldo</span></div>
      @for (h of data().holders; track h.kind + h.id) {
        <div class="grid who">
          <span class="name">{{ holderName(h) }}</span>
          <span class="r"><bo-pill tone="dim">{{ h.kind }}</bo-pill></span>
          <span class="num" [class.dim]="!h.pendingCents">{{ h.pendingCents ? money(h.pendingCents) : '—' }}</span>
          <span class="num">{{ money(h.availableCents + h.pendingCents) }}</span>
        </div>
      } @empty {
        <p class="note">Ninguém tem saldo guardado na conta agora.</p>
      }
    </bo-panel-card>

    <bo-panel-card title="Saques">
      <button card-actions type="button" class="bo-mini-btn" (click)="openWithdrawals.emit()">Abrir fila de saques</button>
      <div class="grid two">
        <span>Esperando aprovação <span class="dim">· já contados em "em saque"</span></span>
        <span class="num">{{ pendingCount() }} · {{ money(pendingCents()) }}</span>
      </div>
      @for (s of data().stuckWithdrawals; track s.id) {
        <div class="grid two stuck">
          <span><bo-pill tone="red">Aprovado e não pago</bo-pill> {{ s.kind }}{{ s.approvedAt ? ' · aprovado em ' + date(s.approvedAt) : '' }} <span class="dim">· PIX {{ s.payoutStatus === 'failed' ? 'falhou' : 'não saiu' }} ({{ s.id }})</span></span>
          <span class="num">{{ money(s.amountCents) }}</span>
        </div>
      }
    </bo-panel-card>
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
    .cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
    .total { font-family: var(--nx-font-display); font-weight: 700; font-size: 16px; }
    .grid { display: grid; grid-template-columns: minmax(0, 1fr) 110px 110px 110px; gap: 12px; align-items: center; padding: 11px 0; border-bottom: 1px solid var(--nx-line); font-size: 13px; }
    .grid:last-of-type { border-bottom: none; }
    .grid.two { grid-template-columns: minmax(0, 1fr) auto; }
    .grid.who { grid-template-columns: minmax(0, 1fr) 120px 110px 120px; }
    .head { padding-top: 0; }
    .head span { font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: var(--nx-text-dim); }
    .r { text-align: right; }
    .num { font-family: var(--nx-font-mono); font-size: 12.5px; text-align: right; white-space: nowrap; }
    .dim { color: var(--nx-text-dim); font-size: 11.5px; }
    .num.dim { font-size: 12.5px; }
    .name { font-family: var(--nx-font-display); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .stuck { background: rgba(255, 59, 48, 0.06); border-radius: 8px; padding-left: 8px; padding-right: 8px; }
    .note { margin: 10px 0 0; font-size: 12px; line-height: 1.5; color: var(--nx-text-mute); }
    @media (max-width: 1280px) { .cards { grid-template-columns: minmax(0, 1fr); } }
    @media (max-width: 760px) {
      .grid { grid-template-columns: minmax(0, 1fr) 96px; }
      .grid > :nth-child(2), .grid > :nth-child(3) { display: none; }
      .grid.two > :nth-child(2) { display: block; }
      .grid.who { grid-template-columns: minmax(0, 1fr) 110px; }
    }
  `,
})
export class CompanyThirdPartyComponent {
  readonly data = input.required<CompanyFinance>();
  readonly openWithdrawals = output<void>();

  protected readonly order = THIRD_PARTY_ORDER;
  protected readonly label = THIRD_PARTY_LABEL;
  protected readonly plural = KIND_PLURAL;
  protected readonly money = money;
  protected readonly inAccount = inAccountCents;
  protected readonly holderName = holderName;

  protected readonly p = computed(() => this.data().provisions);
  protected readonly pendingCount = computed(() => {
    const w = this.data().pendingWithdrawals;
    return w.organizer.count + w.arena.count + w.professor.count;
  });
  protected readonly pendingCents = computed(() => {
    const w = this.data().pendingWithdrawals;
    return w.organizer.cents + w.arena.cents + w.professor.cents;
  });

  protected date(d: Date): string {
    return DATE.format(d);
  }
}
