import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  availableHint,
  brl,
  dayMonth,
  earnedCents,
  plural,
  statementLines,
  totalHint,
  weekBars,
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
    const m = v.member;
    const e = m.earnings;
    const pending = v.extras.pending;
    return [
      { key: 'Disponível', value: brl(e.availableCents), sub: availableHint(m), hot: true },
      {
        key: 'A liberar',
        value: brl(e.pendingCents),
        sub: pending > 0 ? plural(pending, 'pagamento pendente', 'pagamentos pendentes') : 'nada aguardando pagamento',
        hot: false,
      },
      {
        key: 'Já recebido',
        value: brl(e.receivedCents),
        sub: m.payouts[0]?.at ? `repasse de ${dayMonth(m.payouts[0].at)}` : 'nenhum repasse ainda',
        hot: false,
      },
      { key: m.cycleId === 'piloto' ? 'Total no piloto' : 'Total no ciclo', value: brl(earnedCents(m)), sub: totalHint(m), hot: false },
    ];
  });

  protected readonly weeks = computed(() => {
    const v = this.store.ambassador();
    return v ? weekBars(v.member.weekly) : { bars: [], best: null };
  });
  protected readonly bestLabel = computed(() => {
    const best = this.weeks().best;
    return best ? `${brl(best.cents, false)} · semana de ${dayMonth(best.weekStart)}` : null;
  });

  protected readonly how = computed(() => {
    const v = this.store.ambassador();
    if (!v) return [];
    return [
      { icon: 'check', title: 'Pagamento confirmado', sub: 'A comissão é liberada quando o atleta paga a inscrição.' },
      {
        icon: 'cal',
        title: `Próximo repasse em ${dayMonth(v.member.earnings.nextPayoutDate)}`,
        sub: `O liberado cai na sua carteira do Squad. Abaixo de ${brl(v.member.earnings.minPayoutCents, false)}, acumula para o próximo.`,
      },
      { icon: 'x', title: 'Reembolso cancela', sub: 'Se a inscrição for reembolsada, a comissão sai do saldo.' },
    ];
  });

  private readonly allLines = computed(() => {
    const v = this.store.ambassador();
    return v ? statementLines(v.member, this.filter(), this.now) : [];
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
