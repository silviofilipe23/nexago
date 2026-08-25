import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { callableErrorMessage } from '../data/callable-error';
import { IconComponent } from '../ui/icon.component';
import { KpiMiniComponent } from '../ui/kpi-mini.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PillComponent } from '../ui/pill.component';
import {
  FinanceOverviewRepository,
  type CostCategory,
  type FinanceOverview,
  type PlatformCostItem,
} from './data/finance-overview.repository';
import { CostBreakdownDialogComponent, type NewCostInput } from './ui/cost-breakdown-dialog.component';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ok'; data: FinanceOverview }
  | { kind: 'error'; message: string };

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

const TIER_LABEL: Record<string, string> = { starter: 'Starter', pro: 'Pro', elite: 'Elite' };

function money(cents: number): string {
  return BRL.format(cents / 100);
}

/** Dashboard financeiro estilo CFO: MRR/ARR reais, custos e plano de ação de break-even. */
@Component({
  selector: 'bo-finance-overview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelCardComponent, KpiMiniComponent, PillComponent, IconComponent, CostBreakdownDialogComponent],
  template: `
    <div class="overview">
      @switch (state().kind) {
        @case ('loading') {
          <p class="status">Carregando visão financeira…</p>
        }
        @case ('error') {
          <div class="bo-alert">
            <bo-icon name="alert" [size]="16" />
            <span>{{ errorMessage() }}</span>
          </div>
          <button type="button" class="bo-mini-btn retry" (click)="load()">Tentar de novo</button>
        }
        @case ('ok') {
          @if (feedback(); as message) {
            <div class="bo-feedback">
              <bo-icon name="check" [size]="15" />
              <span>{{ message }}</span>
            </div>
          }

          <div class="kpi-grid">
            <bo-kpi-mini label="ARR" [value]="money(data().arrCents)" />
            <bo-kpi-mini
              label="MRR"
              [value]="money(data().mrrCents)"
              [tone]="data().breakEven.achieved ? 'green' : 'red'"
            />
            <bo-kpi-mini label="Arenas ativas" [value]="activeArenasLabel()" />
            <bo-kpi-mini label="Ticket médio" [value]="money(data().avgTicketCents)" />
          </div>

          <div class="costs-grid">
            <button type="button" class="cost-card" (click)="openCosts('fixed')">
              <div class="cost-head">
                <span class="cost-label">Custos fixos</span>
                <bo-icon name="chevron-right" [size]="15" />
              </div>
              <div class="cost-value">{{ money(data().fixedCostsCents) }}</div>
              <div class="cost-meta">
                {{ data().fixedCosts.length }}
                {{ data().fixedCosts.length === 1 ? 'item cadastrado' : 'itens cadastrados' }} · clique para ver
              </div>
            </button>

            <button type="button" class="cost-card" (click)="openCosts('variable')">
              <div class="cost-head">
                <span class="cost-label">Custos variáveis</span>
                <bo-icon name="chevron-right" [size]="15" />
              </div>
              <div class="cost-value">{{ money(data().variableCostsCents) }}</div>
              <div class="cost-meta">
                {{ data().variableCosts.length }}
                {{ data().variableCosts.length === 1 ? 'item cadastrado' : 'itens cadastrados' }} · clique para ver
              </div>
            </button>
          </div>

          <bo-panel-card kicker="Receita por plano" title="MRR por tier">
            <div class="tier-table">
              <div class="tier-head">
                <span>Plano</span>
                <span class="right">Arenas</span>
                <span class="right">MRR</span>
              </div>
              @for (row of data().byTier; track row.tier) {
                <div class="tier-row">
                  <span>{{ tierLabel(row.tier) }}</span>
                  <span class="right mono">{{ row.count }}</span>
                  <span class="right mono">{{ money(row.mrrCents) }}</span>
                </div>
              }
            </div>
          </bo-panel-card>

          <bo-panel-card
            [kicker]="data().breakEven.achieved ? 'Break-even alcançado' : 'Plano de ação · break-even'"
            [title]="breakEvenTitle()"
            [accent]="!data().breakEven.achieved"
          >
            @if (data().breakEven.achieved) {
              <p class="be-text">
                Seu MRR ({{ money(data().mrrCents) }}) cobre os custos totais
                ({{ money(data().totalCostsCents) }}). Sobra de {{ money(data().mrrCents - data().totalCostsCents) }}
                por mês.
              </p>
            } @else {
              <p class="be-text">
                Custo total mensal de {{ money(data().totalCostsCents) }} contra
                {{ money(data().mrrCents) }} de MRR — faltam {{ money(data().breakEven.gapCents) }} por mês.
                Pra fechar essa conta, feche
                <strong>{{ data().breakEven.plansNeeded }} {{ plansLabel() }}</strong>
                do plano {{ tierLabel(data().breakEven.entryTier) }}
                ({{ money(data().breakEven.entryPlanMonthlyCents) }}/mês cada).
              </p>

              @if (data().breakEven.targetArenas.length > 0) {
                <div class="targets">
                  <div class="targets-head">Arenas pré-cadastradas pra priorizar</div>
                  <div class="target-list">
                    @for (arena of data().breakEven.targetArenas; track arena.id) {
                      <div class="target-row">
                        <div class="target-info">
                          <div class="target-name">{{ arena.name }}</div>
                          <div class="target-meta">
                            {{ arena.city ?? 'Cidade não informada' }} ·
                            {{ arena.contactAthletesCount }}
                            {{ arena.contactAthletesCount === 1 ? 'atleta interessado' : 'atletas interessados' }}
                          </div>
                        </div>
                        @if (whatsappLink(arena.whatsapp); as link) {
                          <a class="bo-mini-btn" [href]="link" target="_blank" rel="noopener">
                            <bo-icon name="mail" [size]="13" />
                            Contatar
                          </a>
                        } @else {
                          <bo-pill tone="dim">Sem WhatsApp</bo-pill>
                        }
                      </div>
                    }
                  </div>
                </div>
              } @else {
                <p class="be-empty">
                  Nenhuma arena pré-cadastrada disponível agora — abra
                  <em>Arenas · Pré-cadastradas</em> pra alimentar essa fila de prospecção.
                </p>
              }
            }
          </bo-panel-card>
        }
      }
    </div>

    @if (dialogCategory(); as category) {
      <bo-cost-breakdown-dialog
        [open]="true"
        [title]="category === 'fixed' ? 'Custos fixos' : 'Custos variáveis'"
        [category]="category"
        [items]="dialogItems()"
        [totalCents]="dialogTotal()"
        [saving]="saving()"
        [removingId]="removingId()"
        [error]="dialogError()"
        (dismissed)="closeCosts()"
        (add)="addCost($event)"
        (remove)="removeCost($event)"
      />
    }
  `,
  styles: `
    .overview {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .status {
      font-size: 12.5px;
      color: var(--nx-text-dim);
    }

    .retry {
      align-self: flex-start;
    }

    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
    }

    .costs-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }

    .cost-card {
      display: flex;
      flex-direction: column;
      gap: 8px;
      text-align: left;
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-4);
      padding: 16px;
      cursor: pointer;
      font: inherit;
      color: inherit;
      transition: border-color 140ms var(--nx-ease-out);
    }

    .cost-card:hover {
      border-color: var(--nx-line-strong);
    }

    .cost-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      color: var(--nx-text-dim);
    }

    .cost-label {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.16em;
      text-transform: uppercase;
    }

    .cost-value {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 26px;
      letter-spacing: -0.02em;
      color: var(--nx-text);
    }

    .cost-meta {
      font-size: 11.5px;
      color: var(--nx-text-dim);
    }

    .tier-table {
      display: flex;
      flex-direction: column;
    }

    .tier-head,
    .tier-row {
      display: grid;
      grid-template-columns: 1fr 100px 140px;
      gap: 10px;
      align-items: center;
    }

    .tier-head {
      padding-bottom: 8px;
      border-bottom: 1px solid var(--nx-line-strong);
    }

    .tier-head span {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }

    .tier-row {
      padding: 9px 0;
      border-bottom: 1px solid var(--nx-line);
      font-size: 13px;
    }

    .tier-row:last-child {
      border-bottom: none;
    }

    .right {
      text-align: right;
    }

    .mono {
      font-family: var(--nx-font-mono);
      font-weight: 700;
    }

    .be-text {
      margin: 0;
      font-size: 13.5px;
      line-height: 1.6;
      color: var(--nx-text-mute);
    }

    .be-text strong {
      color: var(--nx-text);
    }

    .be-empty {
      margin: 12px 0 0;
      font-size: 12.5px;
      color: var(--nx-text-dim);
    }

    .targets {
      margin-top: 16px;
    }

    .targets-head {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      margin-bottom: 8px;
    }

    .target-list {
      display: flex;
      flex-direction: column;
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-3);
      overflow: hidden;
    }

    .target-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 12px;
      border-bottom: 1px solid var(--nx-line);
    }

    .target-row:last-child {
      border-bottom: none;
    }

    .target-info {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .target-name {
      font-size: 13px;
      font-weight: 600;
      color: var(--nx-text);
    }

    .target-meta {
      font-size: 11.5px;
      color: var(--nx-text-dim);
    }

    @media (max-width: 900px) {
      .kpi-grid,
      .costs-grid {
        grid-template-columns: 1fr 1fr;
      }
    }
  `,
})
export class FinanceOverviewComponent {
  private readonly repository = inject(FinanceOverviewRepository);

  protected readonly state = signal<LoadState>({ kind: 'loading' });
  protected readonly feedback = signal<string | null>(null);
  protected readonly dialogCategory = signal<CostCategory | null>(null);
  protected readonly saving = signal(false);
  protected readonly removingId = signal<string | null>(null);
  protected readonly dialogError = signal<string | null>(null);

  constructor() {
    void this.load();
  }

  protected readonly data = computed<FinanceOverview>(() => {
    const state = this.state();
    if (state.kind !== 'ok') {
      throw new Error('data() só deve ser lido quando state.kind === "ok"');
    }
    return state.data;
  });

  protected readonly errorMessage = computed(() => {
    const state = this.state();
    return state.kind === 'error' ? state.message : '';
  });

  protected readonly activeArenasLabel = computed(() => String(this.data().activeArenasCount));

  protected readonly dialogItems = computed<readonly PlatformCostItem[]>(() => {
    const category = this.dialogCategory();
    const state = this.state();
    if (!category || state.kind !== 'ok') {
      return [];
    }
    return category === 'fixed' ? state.data.fixedCosts : state.data.variableCosts;
  });

  protected readonly dialogTotal = computed<number | null>(() => {
    const category = this.dialogCategory();
    const state = this.state();
    if (!category || state.kind !== 'ok') {
      return null;
    }
    return category === 'fixed' ? state.data.fixedCostsCents : state.data.variableCostsCents;
  });

  protected readonly breakEvenTitle = computed(() => {
    const state = this.state();
    if (state.kind !== 'ok') {
      return '';
    }
    return state.data.breakEven.achieved
      ? 'Seu MRR cobre os custos da operação'
      : 'Custo maior que o MRR — feche estas arenas';
  });

  protected readonly plansLabel = computed(() =>
    this.data().breakEven.plansNeeded === 1 ? 'plano' : 'planos',
  );

  protected async load(): Promise<void> {
    this.state.set({ kind: 'loading' });
    try {
      this.state.set({ kind: 'ok', data: await this.repository.getOverview() });
    } catch (err) {
      this.state.set({ kind: 'error', message: callableErrorMessage(err) });
    }
  }

  protected money(cents: number): string {
    return money(cents);
  }

  protected tierLabel(tier: string): string {
    return TIER_LABEL[tier] ?? tier;
  }

  protected whatsappLink(whatsapp: string | null): string | null {
    if (!whatsapp) {
      return null;
    }
    const digits = whatsapp.replace(/\D/g, '');
    if (!digits) {
      return null;
    }
    const withCountry = digits.startsWith('55') ? digits : `55${digits}`;
    return `https://wa.me/${withCountry}`;
  }

  protected openCosts(category: CostCategory): void {
    this.dialogError.set(null);
    this.dialogCategory.set(category);
  }

  protected closeCosts(): void {
    if (this.saving()) {
      return;
    }
    this.dialogCategory.set(null);
  }

  protected async addCost(input: NewCostInput): Promise<void> {
    const category = this.dialogCategory();
    if (!category || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.dialogError.set(null);
    try {
      await this.repository.upsertCost({ category, ...input });
      await this.load();
      this.feedback.set(`Custo "${input.name}" adicionado.`);
    } catch (err) {
      this.dialogError.set(callableErrorMessage(err));
    } finally {
      this.saving.set(false);
    }
  }

  protected async removeCost(id: string): Promise<void> {
    if (this.removingId()) {
      return;
    }
    const item = this.dialogItems().find((row) => row.id === id);
    this.removingId.set(id);
    this.dialogError.set(null);
    try {
      await this.repository.deleteCost(id);
      await this.load();
      this.feedback.set(item ? `Custo "${item.name}" removido.` : 'Custo removido.');
    } catch (err) {
      this.dialogError.set(callableErrorMessage(err));
    } finally {
      this.removingId.set(null);
    }
  }
}
