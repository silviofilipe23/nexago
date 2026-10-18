import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  availableHint,
  brl,
  dayMonth,
  payoutDaysLabel,
  plural,
  statementLines,
  totalHint,
  weeklyCommissions,
  type StatementFilter,
} from './data/squad-model';
import { SQUAD_NOW } from './data/squad-tokens';
import { SquadStore } from './data/squad.store';
import { SquadFrameComponent } from './ui/squad-frame.component';

const STATEMENT_PAGE = 15;

/** 02 · Ganhos: saldo por estágio, comissão por semana, como recebe e o extrato. */
@Component({
  selector: 'app-squad-ganhos',
  imports: [SquadFrameComponent],
  templateUrl: './squad-ganhos.component.html',
  styleUrl: './squad-ganhos.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SquadGanhosComponent {
  protected readonly store = inject(SquadStore);
  private readonly now = inject(SQUAD_NOW)();

  protected readonly filter = signal<StatementFilter>('all');
  protected readonly filters: ReadonlyArray<{ id: StatementFilter; label: string }> = [
    { id: 'all', label: 'Tudo' },
    { id: 'commissions', label: 'Comissões' },
    { id: 'payouts', label: 'Repasses' },
  ];

  protected readonly cards = computed(() => {
    const v = this.store.ambassador();
    if (!v) return [];
    const t = v.totals;
    return [
      { key: 'Disponível', value: brl(t.availableCents), sub: availableHint(v), hot: true },
      {
        key: 'A liberar',
        value: brl(t.pendingCents),
        sub: t.pendingCount > 0 ? `${plural(t.pendingCount, 'pagamento pendente', 'pagamentos pendentes')}` : 'nada aguardando pagamento',
        hot: false,
      },
      {
        key: 'Já recebido',
        value: brl(t.receivedCents),
        sub: t.lastPayoutAt ? `repasse de ${dayMonth(t.lastPayoutAt)}` : 'nenhum repasse ainda',
        hot: false,
      },
      { key: v.cycle.id === 'piloto' ? 'Total no piloto' : 'Total no ciclo', value: brl(t.earnedCents), sub: totalHint(v), hot: false },
    ];
  });

  protected readonly weeks = computed(() => {
    const v = this.store.ambassador();
    return v ? weeklyCommissions(v.commissions, this.now) : { bars: [], best: null };
  });
  protected readonly bestLabel = computed(() => {
    const best = this.weeks().best;
    return best ? brl(best.cents, false) : null;
  });

  protected readonly how = computed(() => {
    const v = this.store.ambassador();
    if (!v) return [];
    return [
      { icon: 'check', title: 'Pagamento confirmado', sub: 'A comissão é liberada quando o atleta paga a inscrição.' },
      {
        icon: 'cal',
        title: `Repasse nos ${payoutDaysLabel(v.payout.days)}`,
        sub: `O liberado cai na sua carteira do Squad. Abaixo de ${brl(v.payout.minNetCents, false)}, acumula para o próximo.`,
      },
      { icon: 'x', title: 'Reembolso cancela', sub: 'Se a inscrição for reembolsada, a comissão sai do saldo.' },
    ];
  });

  private readonly allLines = computed(() => {
    const v = this.store.ambassador();
    return v ? statementLines(v, this.filter(), this.now) : [];
  });
  /** O extrato abre com as 15 mais recentes; "Mostrar mais" soma outras 15. */
  protected readonly shown = signal(STATEMENT_PAGE);
  protected readonly lines = computed(() => this.allLines().slice(0, this.shown()));
  protected readonly hasMore = computed(() => this.allLines().length > this.shown());

  protected setFilter(id: StatementFilter): void {
    this.filter.set(id);
    this.shown.set(STATEMENT_PAGE);
  }

  protected showMore(): void {
    this.shown.update((n) => n + STATEMENT_PAGE);
  }
}
