import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../auth/auth.service';
import { callableErrorMessage } from '../../data/callable-error';
import { SquadKpiComponent } from '../../squad/ui/squad-kpi.component';
import { ConfirmDialogComponent } from '../../ui/confirm-dialog.component';
import { IconComponent } from '../../ui/icon.component';
import { PanelCardComponent } from '../../ui/panel-card.component';
import { PanelShellComponent } from '../../ui/panel-shell.component';
import { isVersionConflict, saveErrorText } from './data/save-errors';
import {
  COMMISSION_PCT,
  DEFAULT_RULES,
  DEFAULT_SPONSORS,
  brl,
  clone,
  effectivePlan,
  marginPct,
  saoPauloDate,
  validateRules,
  type PlanEntry,
  type PlanRules,
  type SponsorsConfig,
} from './data/tournament-plans';
import { TournamentPlansRepository, type LogEntry } from './data/tournament-plans.repository';
import { FinanceCardComponent, type FinanceRow } from './ui/finance-card.component';
import { PlanCardComponent } from './ui/plan-card.component';
import { PlansLogDrawerComponent } from './ui/plans-log-drawer.component';

/**
 * Torneios › Planos (tela 01): os pacotes por quadra, as regras que valem para todos e a
 * estrutura financeira. Os números de venda do protótipo (eventos, receita) ficam de fora:
 * os pedidos dos organizadores vivem em Torneios › Contratos, ainda sem cobrança online.
 */
@Component({
  selector: 'bo-panel-planos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:beforeunload)': 'onBeforeUnload($event)' },
  imports: [
    RouterLink,
    PanelShellComponent,
    PanelCardComponent,
    IconComponent,
    ConfirmDialogComponent,
    SquadKpiComponent,
    PlanCardComponent,
    FinanceCardComponent,
    PlansLogDrawerComponent,
  ],
  template: `
    <bo-panel-shell>
      <header class="head">
        <div class="titles">
          <div class="crumb">Torneios · pacotes de organização por evento</div>
          <h1>Planos de torneio</h1>
        </div>
        <div class="spacer"></div>
        <button type="button" class="bo-mini-btn" (click)="openLog()"><bo-icon name="history" [size]="14" /> Histórico</button>
        @if (canEdit()) {
          <a class="bo-mini-btn bo-mini-btn-primary" routerLink="/painel/torneios/planos/novo">
            <bo-icon name="plus" [size]="14" /> Novo plano
          </a>
        }
      </header>

      <div class="body">
        @switch (state()) {
          @case ('loading') {
            <div class="kpis" aria-busy="true" aria-label="Carregando planos">
              @for (s of [0, 1, 2, 3, 4]; track s) {
                <div class="skel sm"></div>
              }
            </div>
            <div class="plans">
              @for (s of [0, 1, 2, 3]; track s) {
                <div class="skel"></div>
              }
            </div>
          }
          @case ('error') {
            <div class="bo-alert" role="alert">
              <bo-icon name="alert" [size]="16" />
              <span>{{ loadError() }}</span>
              <button type="button" class="bo-mini-btn push" (click)="load()">Tentar de novo</button>
            </div>
          }
          @default {
            <div class="kpis">
              <bo-squad-kpi label="Planos à venda" [value]="String(active().length)" [hint]="hiddenHint()" />
              <bo-squad-kpi label="Faixa de preço" [value]="priceRange()" hint="Por evento, sem a comissão" />
              <bo-squad-kpi label="Margem média" [value]="avgMargin()" [hint]="'Mínima de ' + rules().minMarginPct + '%'" />
              <bo-squad-kpi label="Comissão" [value]="commission + '%'" hint="Sobre inscrições · negociável" />
              <bo-squad-kpi label="Cotas Sponsors" [value]="String(sponsorsOnSale())" [hint]="sponsorsHint()" />
            </div>
            <p class="notice">
              <bo-icon name="clock" [size]="14" />
              Os pedidos dos organizadores ficam em <a routerLink="/painel/torneios/contratos">Contratos</a>. Eventos
              contratados, receita e margem realizada ainda não aparecem nesta tela.
            </p>

            <bo-panel-card kicker="Valem para todos os planos" title="Regras gerais">
              <div class="rules">
                <div class="rule">
                  <span class="k">Inscrições <bo-icon name="lock" [size]="11" /></span>
                  <strong>Exclusivas pela NexaGO</strong>
                  <p>Obrigatório. O organizador não pode receber inscrições por fora.</p>
                </div>
                <div class="rule">
                  <span class="k">Comissão <bo-icon name="lock" [size]="11" /></span>
                  <strong>{{ commission }}% sobre inscrições</strong>
                  <p>Cobrada além do valor do plano, em cada inscrição paga. Negociada por organizador no cadastro dele.</p>
                </div>
                <div class="rule">
                  <span class="k">Transmissão</span>
                  <strong>Só na quadra principal</strong>
                  <p>Com narração, independentemente da quantidade de quadras.</p>
                </div>
                <div class="rule">
                  <span class="k">Cobertura</span>
                  <strong>{{ coverage() }}</strong>
                  <p>{{ coverageHint() }}</p>
                </div>
              </div>
            </bo-panel-card>

            <div class="section">
              <h2>Planos</h2>
              <span>Cada plano soma 1 quadra e os árbitros dela ao anterior</span>
            </div>
            <div class="plans">
              @for (e of plans(); track e.id) {
                <bo-plan-card [entry]="e" [rules]="rules()" [today]="today" />
              }
            </div>

            @if (rulesError(); as text) {
              <div class="bo-alert" role="alert">
                <bo-icon name="alert" [size]="16" />
                <span>{{ text }}</span>
                @if (rulesConflict()) {
                  <button type="button" class="bo-mini-btn push" (click)="load()">Recarregar</button>
                }
              </div>
            }
            <bo-finance-card
              [rows]="financeRows()"
              [rules]="rulesDraft()"
              [version]="rulesVersion()"
              [issues]="rulesIssues()"
              [dirty]="rulesDirty()"
              [saving]="savingRules()"
              [readonly]="!canEdit()"
              (rulesChange)="rulesDraft.set($event)"
              (discard)="discardRules()"
              (save)="saveRules()"
            />
          }
        }
      </div>

      @if (toast(); as t) {
        <div class="toast" role="status"><bo-icon name="check" [size]="15" /> {{ t }}</div>
      }

      @if (logOpen()) {
        <bo-plans-log-drawer
          intro="Publicações dos planos e da estrutura financeira, da mais recente para trás."
          [entries]="log()"
          [error]="logError()"
          (closed)="logOpen.set(false)"
        />
      }

      <bo-confirm-dialog
        [open]="leaveOpen()"
        title="Sair sem salvar?"
        description="As alterações na estrutura financeira serão descartadas."
        confirmLabel="Sair sem salvar"
        tone="danger"
        (confirmed)="resolveLeave(true)"
        (dismissed)="resolveLeave(false)"
      />
    </bo-panel-shell>
  `,
  styles: `
    .head { display: flex; align-items: center; gap: 10px; padding: 18px 32px; border-bottom: 1px solid var(--nx-line); flex-wrap: wrap; }
    .titles { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    .crumb { font-family: var(--nx-font-mono); font-size: 10px; font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    h1 { margin: 0; font-family: var(--nx-font-display); font-weight: 800; font-size: 21px; letter-spacing: -0.02em; }
    .spacer { flex: 1; }
    a.bo-mini-btn { text-decoration: none; }
    .body { flex: 1; padding: 24px 32px 40px; display: flex; flex-direction: column; gap: 20px; min-width: 0; }
    .push { margin-left: auto; flex: none; }
    .kpis { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 16px; }
    .notice { margin: -6px 0 0; display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--nx-text-dim); }
    .notice a { color: var(--nx-orange-500); }
    .rules { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
    .rule { padding: 14px 16px; border-radius: var(--nx-r-3); background: var(--nx-surface-1); border: 1px solid var(--nx-line); display: flex; flex-direction: column; gap: 6px; min-width: 0; }
    .k { display: flex; align-items: center; gap: 6px; font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    .rule strong { font-family: var(--nx-font-display); font-weight: 700; font-size: 15px; }
    .rule p { margin: 0; font-size: 11.5px; line-height: 1.45; color: var(--nx-text-dim); }
    .section { display: flex; align-items: baseline; gap: 10px; margin-top: 4px; flex-wrap: wrap; }
    .section h2 { margin: 0; font-family: var(--nx-font-display); font-weight: 700; font-size: 15px; }
    .section span { font-size: 12px; color: var(--nx-text-dim); }
    .plans { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; }
    .skel { height: 520px; border-radius: var(--nx-r-4); background: var(--nx-surface-0); border: 1px solid var(--nx-line); }
    .skel.sm { height: 104px; }
    .toast { position: fixed; right: 24px; bottom: 24px; z-index: 50; display: flex; align-items: center; gap: 8px; padding: 12px 16px; border-radius: var(--nx-r-3); background: var(--nx-surface-1); border: 1px solid rgba(43, 209, 126, 0.4); font-family: var(--nx-font-display); font-weight: 600; font-size: 13px; box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5); }
    .toast bo-icon { color: var(--nx-win); }
    @media (max-width: 1280px) {
      .kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .plans, .rules { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    @media (max-width: 760px) {
      .head, .body { padding-left: 16px; padding-right: 16px; }
      .kpis, .plans, .rules { grid-template-columns: minmax(0, 1fr); }
    }
  `,
})
export class PanelPlanosComponent {
  private readonly repo = inject(TournamentPlansRepository);
  private readonly auth = inject(AuthService);
  private toastTimer: ReturnType<typeof setTimeout> | undefined;

  protected readonly String = String;
  protected readonly commission = COMMISSION_PCT;
  protected readonly today = saoPauloDate(new Date());

  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly loadError = signal('');
  protected readonly plans = signal<PlanEntry[]>([]);
  protected readonly sponsors = signal<SponsorsConfig>(clone(DEFAULT_SPONSORS));
  protected readonly rules = signal<PlanRules>(clone(DEFAULT_RULES));
  protected readonly rulesVersion = signal(1);
  protected readonly rulesDraft = signal<PlanRules>(clone(DEFAULT_RULES));
  protected readonly savingRules = signal(false);
  protected readonly rulesError = signal<string | null>(null);
  protected readonly rulesConflict = signal(false);
  protected readonly toast = signal<string | null>(null);

  protected readonly logOpen = signal(false);
  protected readonly log = signal<LogEntry[] | null>(null);
  protected readonly logError = signal<string | null>(null);

  protected readonly leaveOpen = signal(false);
  private leaveResolver: ((ok: boolean) => void) | null = null;

  protected readonly canEdit = computed(() => this.auth.isSuperAdmin() || this.auth.roles().includes('admin'));

  /** Os planos como valem hoje (o novo nunca publicado fica fora das contas). */
  private readonly live = computed(() =>
    this.plans()
      .map((e) => ({ id: e.id, plan: effectivePlan(e, this.today) }))
      .filter((r): r is FinanceRow => r.plan !== null),
  );
  protected readonly active = computed(() => this.live().filter((r) => r.plan.status === 'ativo'));
  protected readonly financeRows = computed(() => this.live().filter((r) => r.plan.status !== 'rascunho'));

  protected readonly hiddenHint = computed(() => {
    const off = this.live().length - this.active().length;
    return off > 0 ? `${off} oculto${off > 1 ? 's' : ''} ou em rascunho` : 'Todos visíveis ao organizador';
  });
  protected readonly priceRange = computed(() => {
    const prices = this.active().map((r) => r.plan.priceCents);
    if (prices.length === 0) {
      return '—';
    }
    const [lo, hi] = [Math.min(...prices), Math.max(...prices)];
    return lo === hi ? brl(lo) : `${brl(lo)}–${brl(hi).replace('R$', '').trim()}`;
  });
  protected readonly avgMargin = computed(() => {
    const list = this.active();
    if (list.length === 0) {
      return '—';
    }
    const sum = list.reduce((s, r) => s + marginPct(r.plan, this.rules()), 0);
    return `${Math.round(sum / list.length)}%`;
  });
  protected readonly sponsorsOnSale = computed(() => this.sponsors().tiers.filter((t) => t.onSale).length);
  protected readonly sponsorsHint = computed(() => {
    const prices = this.sponsors().tiers.filter((t) => t.onSale).map((t) => t.priceCents);
    return prices.length ? `De ${brl(Math.min(...prices))} a ${brl(Math.max(...prices))} por evento` : 'Nenhuma à venda';
  });
  protected readonly coverage = computed(() => {
    const hours = [...new Set(this.active().map((r) => r.plan.hours))].sort((a, b) => a - b);
    if (hours.length === 0) {
      return '—';
    }
    return hours.length === 1 ? `Até ${hours[0]} horas de evento` : `De ${hours[0]} a ${hours.at(-1)} horas`;
  });
  protected readonly coverageHint = computed(() =>
    new Set(this.active().map((r) => r.plan.hours)).size <= 1
      ? `Mesmo limite para os ${this.active().length} planos. Passou disso, vale a hora extra do plano.`
      : 'Varia por plano. Passou disso, vale a hora extra do plano.',
  );

  protected readonly rulesIssues = computed(() => validateRules(this.rulesDraft()));
  protected readonly rulesDirty = computed(
    () => JSON.stringify(this.rulesDraft()) !== JSON.stringify(this.rules()),
  );

  constructor() {
    void this.load();
    inject(DestroyRef).onDestroy(() => clearTimeout(this.toastTimer));
  }

  async load(): Promise<void> {
    this.state.set('loading');
    this.rulesError.set(null);
    this.rulesConflict.set(false);
    try {
      const [plans, rules, sponsors] = await Promise.all([this.repo.plans(), this.repo.rules(), this.repo.sponsors()]);
      this.plans.set(plans);
      this.rules.set(rules.value);
      this.rulesDraft.set(clone(rules.value));
      this.rulesVersion.set(rules.version);
      this.sponsors.set(sponsors.value);
      this.log.set(null);
      this.state.set('ready');
    } catch (error) {
      this.loadError.set(callableErrorMessage(error));
      this.state.set('error');
    }
  }

  protected discardRules(): void {
    this.rulesDraft.set(clone(this.rules()));
    this.rulesError.set(null);
  }

  protected async saveRules(): Promise<void> {
    if (!this.rulesDirty() || Object.keys(this.rulesIssues()).length > 0) {
      return;
    }
    this.savingRules.set(true);
    this.rulesError.set(null);
    this.rulesConflict.set(false);
    try {
      const out = await this.repo.saveRules(this.rulesDraft(), this.rulesVersion());
      this.rules.set(out.value);
      this.rulesDraft.set(clone(out.value));
      this.rulesVersion.set(out.version);
      this.log.set(null);
      this.showToast(`Estrutura financeira salva · v${out.version}`);
    } catch (error) {
      this.rulesError.set(saveErrorText(error));
      this.rulesConflict.set(isVersionConflict(error));
    } finally {
      this.savingRules.set(false);
    }
  }

  protected async openLog(): Promise<void> {
    this.logOpen.set(true);
    if (this.log() !== null) {
      return;
    }
    this.logError.set(null);
    try {
      const all = await this.repo.log();
      this.log.set(all.filter((e) => e.scope !== 'sponsors'));
    } catch (error) {
      this.logError.set(callableErrorMessage(error));
    }
  }

  /** Guard de rota (`canDeactivate`): estrutura financeira suja pergunta antes de sair. */
  canLeave(): boolean | Promise<boolean> {
    if (!this.rulesDirty() || !this.canEdit()) {
      return true;
    }
    this.leaveOpen.set(true);
    return new Promise<boolean>((resolve) => (this.leaveResolver = resolve));
  }

  protected resolveLeave(ok: boolean): void {
    this.leaveOpen.set(false);
    this.leaveResolver?.(ok);
    this.leaveResolver = null;
  }

  protected onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.rulesDirty() && this.canEdit()) {
      event.preventDefault();
    }
  }

  private showToast(text: string): void {
    clearTimeout(this.toastTimer);
    this.toast.set(text);
    this.toastTimer = setTimeout(() => this.toast.set(null), 4000);
  }
}
