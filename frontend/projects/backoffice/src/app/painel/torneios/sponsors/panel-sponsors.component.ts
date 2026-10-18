import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../auth/auth.service';
import { callableErrorMessage } from '../../data/callable-error';
import { SquadKpiComponent } from '../../squad/ui/squad-kpi.component';
import { NumFieldComponent } from '../../squad/niveis-regras/ui/num-field.component';
import { ConfirmDialogComponent } from '../../ui/confirm-dialog.component';
import { IconComponent } from '../../ui/icon.component';
import { PanelCardComponent } from '../../ui/panel-card.component';
import { PanelShellComponent } from '../../ui/panel-shell.component';
import { PillComponent } from '../../ui/pill.component';
import { ToggleComponent } from '../../ui/toggle.component';
import { isVersionConflict, saveErrorText } from '../planos/data/save-errors';
import {
  DEFAULT_SPONSORS,
  LIMITS,
  brl,
  clone,
  effectivePlan,
  saoPauloDate,
  tierIdFor,
  validateSponsors,
  type Issues,
  type SponsorTier,
  type SponsorsConfig,
  type TournamentPlan,
} from '../planos/data/tournament-plans';
import { TournamentPlansRepository, type LogEntry } from '../planos/data/tournament-plans.repository';
import { PlansLogDrawerComponent } from '../planos/ui/plans-log-drawer.component';
import { SponsorTierCardComponent } from './ui/sponsor-tier-card.component';

type BoolKey = 'organizerCanSell' | 'logoApproval' | 'segmentExclusive';

/**
 * Torneios › Sponsors (tela 04): cotas de patrocínio nas transmissões, inventário de aparições e
 * regras de repasse, versionados. Vendas e ocupação por evento ficam para quando a venda existir.
 */
@Component({
  selector: 'bo-panel-sponsors',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:beforeunload)': 'onBeforeUnload($event)' },
  imports: [
    RouterLink,
    PanelShellComponent,
    PanelCardComponent,
    PillComponent,
    IconComponent,
    ToggleComponent,
    NumFieldComponent,
    ConfirmDialogComponent,
    SquadKpiComponent,
    SponsorTierCardComponent,
    PlansLogDrawerComponent,
  ],
  template: `
    <bo-panel-shell>
      <header class="head">
        <div class="titles">
          <div class="crumb">Torneios · cotas de patrocínio nas transmissões</div>
          <h1>NexaGO Sponsors</h1>
          @if (state() === 'ready') {
            <span class="sub">v{{ version() }}{{ dirty() ? ' · alterações não salvas' : '' }}</span>
          }
        </div>
        <div class="spacer"></div>
        <button type="button" class="bo-mini-btn" (click)="openLog()"><bo-icon name="history" [size]="14" /> Histórico</button>
        @if (canEdit()) {
          <button type="button" class="bo-mini-btn bo-mini-btn-primary" [disabled]="state() !== 'ready' || draft().tiers.length >= maxTiers" (click)="addTier()">
            <bo-icon name="plus" [size]="14" /> Nova cota
          </button>
        }
      </header>

      <div class="body">
        @if (saveError(); as text) {
          <div class="bo-alert" role="alert">
            <bo-icon name="alert" [size]="16" />
            <span>{{ text }}</span>
            @if (conflict()) {
              <button type="button" class="bo-mini-btn push" (click)="load()">Recarregar</button>
            }
          </div>
        }
        @switch (state()) {
          @case ('loading') {
            <div class="tiers" aria-busy="true" aria-label="Carregando cotas">
              @for (s of [0, 1, 2]; track s) {
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
              <bo-squad-kpi label="Cotas à venda" [value]="String(onSale().length)" [hint]="'de ' + draft().tiers.length + ' configuradas'" />
              <bo-squad-kpi label="Receita máx. por evento" [value]="brl(maxRevenue())" hint="Todas as cotas no limite" />
              <bo-squad-kpi label="NexaGO fica com" [value]="brl(nexagoShare())" [hint]="(100 - draft().organizerSharePct) + '% · o resto vai ao organizador'" />
              <bo-squad-kpi label="Inventário no limite" [value]="occupancy()" [hint]="fullApps() + ' de ' + capacity() + ' aparições'" />
            </div>
            <p class="notice">
              <bo-icon name="clock" [size]="14" />
              A venda das cotas ainda não existe: cotas vendidas, receita e ocupação por evento aparecem quando ela chegar.
            </p>

            <div class="section">
              <h2>Cotas</h2>
              <span>Vendidas por evento transmitido. Logos aparecem só na transmissão da quadra principal.</span>
            </div>
            <div class="tiers">
              @for (t of draft().tiers; track t.id; let i = $index) {
                <bo-sponsor-tier-card
                  [tier]="t"
                  [issues]="tierIssues(i)"
                  [readonly]="!canEdit()"
                  [removable]="draft().tiers.length > 1"
                  [plansWithoutNarrator]="plansWithoutNarrator()"
                  (tierChange)="setTier(i, $event)"
                  (remove)="removeTier(i)"
                />
              }
            </div>

            <div class="pair">
              <bo-panel-card kicker="Inventário" title="Capacidade de aparições por transmissão">
                <div class="g2">
                  <div class="f">
                    <span class="lbl">Máx. aparições por hora</span>
                    <bo-num-field label="Máximo de aparições por hora" [value]="draft().maxPerHour" [invalid]="!!issues()['maxPerHour']" [disabled]="!canEdit()" (valueChange)="patch({ maxPerHour: whole($event) })" />
                    <span class="hint">{{ issues()['maxPerHour'] || 'Evita poluir a transmissão' }}</span>
                  </div>
                  <div class="f">
                    <span class="lbl">Horas de transmissão</span>
                    <bo-num-field label="Horas de transmissão" suffix="h" [value]="draft().hours" [invalid]="!!issues()['hours']" [disabled]="!canEdit()" (valueChange)="patch({ hours: whole($event) })" />
                    <span class="hint">{{ issues()['hours'] || coverageHint() }}</span>
                  </div>
                </div>
                <div class="cap">
                  <span>Todas as cotas vendidas no limite máximo</span>
                  <b [class.over]="fullApps() > capacity()">{{ fullApps() }} / {{ capacity() }} aparições</b>
                </div>
                <div class="stack">
                  @for (t of onSale(); track t.id) {
                    <div [style.width.%]="share(t)" [style.background]="t.color"></div>
                  }
                </div>
                <div class="legend">
                  @for (t of onSale(); track t.id) {
                    <span><i [style.background]="t.color"></i>{{ t.name }} · {{ t.appearances * t.maxPerEvent }}</span>
                  }
                </div>
                @if (fullApps() > capacity()) {
                  <div class="over-box">
                    <bo-icon name="alert" [size]="15" />
                    As cotas máximas passam a capacidade em {{ fullApps() - capacity() }} aparições. Reduza o máximo por evento ou aumente a capacidade.
                  </div>
                }
              </bo-panel-card>

              <bo-panel-card kicker="Regras" title="Exibição e repasse">
                <div class="row">
                  <div class="t"><strong>Repasse ao organizador</strong><span>Parte da receita da cota que vai para o organizador do evento.</span></div>
                  <bo-num-field class="w100" label="Repasse ao organizador" suffix="%" [value]="draft().organizerSharePct" [invalid]="!!issues()['organizerSharePct']" [disabled]="!canEdit()" (valueChange)="patch({ organizerSharePct: whole($event) })" />
                </div>
                @for (r of boolRules; track r.key) {
                  <div class="row">
                    <div class="t"><strong>{{ r.title }}</strong><span>{{ r.desc }}</span></div>
                    <bo-toggle [ariaLabel]="r.title" [checked]="draft()[r.key]" [disabled]="!canEdit()" (checkedChange)="setBool(r.key, $event)" />
                  </div>
                }
                <div class="row last">
                  <div class="t"><strong>Formato da arte</strong><span>PNG transparente · 1200 × 300 px · sobreposição no canto inferior direito</span></div>
                  <bo-pill tone="dim">Padrão</bo-pill>
                </div>
              </bo-panel-card>
            </div>

            <bo-panel-card kicker="Planos" title="Onde as cotas podem ser vendidas">
              <a card-actions class="bo-ghost-btn" routerLink="/painel/torneios/planos">Ver planos</a>
              @for (p of plans(); track p.name) {
                <div class="row" [class.last]="$last">
                  <div class="t">
                    <strong>{{ p.name }}</strong>
                    <span>{{ !p.live ? 'Sem transmissão: nenhuma cota.' : p.narrator ? 'Transmissão narrada: todas as cotas, com menções.' : 'Transmissão sem narrador: logos sim, menções não.' }}</span>
                  </div>
                  <bo-pill [tone]="!p.live ? 'red' : p.narrator ? 'green' : 'yellow'">{{ !p.live ? 'Sem cotas' : p.narrator ? 'Completo' : 'Só logos' }}</bo-pill>
                </div>
              } @empty {
                <p class="hint">Nenhum plano ativo.</p>
              }
            </bo-panel-card>
          }
        }
      </div>

      @if (dirty() && canEdit()) {
        <div class="unsaved" role="region" aria-label="Alterações não salvas">
          <span class="dot" aria-hidden="true"></span>
          <span class="msg">Você tem alterações não salvas
            @if (issueCount() > 0) { <em>· corrija {{ issueCount() === 1 ? 'o campo marcado' : 'os ' + issueCount() + ' campos marcados' }}</em> }
          </span>
          <button type="button" class="bo-mini-btn" [disabled]="saving()" (click)="discard()">Descartar</button>
          <button type="button" class="bo-mini-btn bo-mini-btn-primary" [disabled]="saving() || issueCount() > 0" (click)="save()">Salvar v{{ version() + 1 }}</button>
        </div>
      }

      @if (toast(); as t) {
        <div class="toast" role="status"><bo-icon name="check" [size]="15" /> {{ t }}</div>
      }

      @if (logOpen()) {
        <bo-plans-log-drawer intro="Versões da configuração de Sponsors, da mais recente para trás." [entries]="log()" [error]="logError()" (closed)="logOpen.set(false)" />
      }

      <bo-confirm-dialog [open]="leaveOpen()" title="Sair sem salvar?" description="As alterações nas cotas serão descartadas." confirmLabel="Sair sem salvar" tone="danger" (confirmed)="resolveLeave(true)" (dismissed)="resolveLeave(false)" />
    </bo-panel-shell>
  `,
  styles: `
    .head { display: flex; align-items: center; gap: 10px; padding: 18px 32px; border-bottom: 1px solid var(--nx-line); flex-wrap: wrap; }
    .titles { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    .crumb { font-family: var(--nx-font-mono); font-size: 10px; font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    h1 { margin: 0; font-family: var(--nx-font-display); font-weight: 800; font-size: 21px; letter-spacing: -0.02em; }
    .sub { font-family: var(--nx-font-mono); font-size: 12px; color: var(--nx-text-dim); }
    .spacer { flex: 1; }
    .body { flex: 1; padding: 24px 32px 40px; display: flex; flex-direction: column; gap: 20px; min-width: 0; }
    .push { margin-left: auto; flex: none; }
    .kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; }
    .notice { margin: -6px 0 0; display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--nx-text-dim); }
    .section { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
    .section h2 { margin: 0; font-family: var(--nx-font-display); font-weight: 700; font-size: 15px; }
    .section span, .hint { font-size: 12px; color: var(--nx-text-dim); }
    .hint { font-size: 11.5px; margin: 0; }
    .tiers { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
    .pair { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
    .g2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
    .f { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
    .lbl { font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    .cap { margin-top: 18px; display: flex; justify-content: space-between; gap: 10px; font-size: 12.5px; color: var(--nx-text-mute); }
    .cap b { font-family: var(--nx-font-mono); color: var(--nx-text); }
    .cap b.over { color: var(--nx-live); }
    .stack { display: flex; height: 12px; margin-top: 8px; border-radius: 6px; background: var(--nx-surface-1); overflow: hidden; }
    .legend { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 10px; font-size: 11.5px; color: var(--nx-text-dim); }
    .legend span { display: flex; align-items: center; gap: 6px; }
    .legend i { width: 8px; height: 8px; border-radius: 2px; }
    .over-box { margin-top: 14px; display: flex; gap: 10px; padding: 11px 13px; border-radius: var(--nx-r-2); background: rgba(255, 59, 48, 0.08); border: 1px solid rgba(255, 59, 48, 0.28); font-size: 12.5px; color: var(--nx-text-mute); }
    .over-box bo-icon { color: var(--nx-live); flex: none; }
    .row { display: flex; align-items: center; gap: 14px; padding: 12px 0; border-bottom: 1px solid var(--nx-line); }
    .row.last { border-bottom: none; }
    .t { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .t strong { font-family: var(--nx-font-display); font-weight: 600; font-size: 13px; }
    .t span { font-size: 11.5px; line-height: 1.45; color: var(--nx-text-dim); }
    .w100 { width: 100px; flex: none; }
    a.bo-ghost-btn { text-decoration: none; }
    .skel { height: 440px; border-radius: var(--nx-r-4); background: var(--nx-surface-0); border: 1px solid var(--nx-line); }
    .unsaved { position: sticky; bottom: 16px; z-index: 20; margin: 0 32px 16px; display: flex; align-items: center; gap: 10px; padding: 10px 12px 10px 16px; border-radius: var(--nx-r-3); background: var(--nx-surface-1); border: 1px solid rgba(255, 106, 26, 0.35); box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5); }
    .dot { width: 8px; height: 8px; flex: none; border-radius: 50%; background: var(--nx-orange-500); }
    .msg { flex: 1; min-width: 0; font-family: var(--nx-font-display); font-weight: 600; font-size: 13px; }
    .msg em { font-style: normal; font-weight: 500; color: var(--nx-live); }
    .toast { position: fixed; right: 24px; bottom: 24px; z-index: 50; display: flex; align-items: center; gap: 8px; padding: 12px 16px; border-radius: var(--nx-r-3); background: var(--nx-surface-1); border: 1px solid rgba(43, 209, 126, 0.4); font-family: var(--nx-font-display); font-weight: 600; font-size: 13px; box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5); }
    .toast bo-icon { color: var(--nx-win); }
    @media (max-width: 1280px) {
      .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .tiers { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .pair { grid-template-columns: minmax(0, 1fr); }
    }
    @media (max-width: 760px) {
      .head, .body { padding-left: 16px; padding-right: 16px; }
      .kpis, .tiers, .g2 { grid-template-columns: minmax(0, 1fr); }
      .unsaved { margin: 0 16px 16px; flex-wrap: wrap; }
      .row { flex-wrap: wrap; }
    }
  `,
})
export class PanelSponsorsComponent {
  private readonly repo = inject(TournamentPlansRepository);
  private readonly auth = inject(AuthService);
  private toastTimer: ReturnType<typeof setTimeout> | undefined;

  protected readonly String = String;
  protected readonly brl = brl;
  protected readonly maxTiers = LIMITS.tiers;
  protected readonly boolRules: ReadonlyArray<{ key: BoolKey; title: string; desc: string }> = [
    { key: 'organizerCanSell', title: 'Organizador pode vender cotas', desc: 'Ele indica o patrocinador local e a NexaGO fatura.' },
    { key: 'logoApproval', title: 'Aprovação da logo antes do evento', desc: 'Moderação confirma arte e marca até 48h antes.' },
    { key: 'segmentExclusive', title: 'Exclusividade por segmento', desc: 'Bloqueia duas marcas do mesmo segmento no mesmo evento.' },
  ];

  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly loadError = signal('');
  protected readonly version = signal(1);
  private readonly saved = signal<SponsorsConfig>(clone(DEFAULT_SPONSORS));
  protected readonly draft = signal<SponsorsConfig>(clone(DEFAULT_SPONSORS));
  protected readonly plans = signal<TournamentPlan[]>([]);
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);
  protected readonly conflict = signal(false);
  protected readonly toast = signal<string | null>(null);
  protected readonly logOpen = signal(false);
  protected readonly log = signal<LogEntry[] | null>(null);
  protected readonly logError = signal<string | null>(null);
  protected readonly leaveOpen = signal(false);
  private leaveResolver: ((ok: boolean) => void) | null = null;

  protected readonly canEdit = computed(() => this.auth.isSuperAdmin() || this.auth.roles().includes('admin'));
  protected readonly issues = computed(() => validateSponsors(this.draft()));
  protected readonly issueCount = computed(() => Object.keys(this.issues()).length);
  protected readonly dirty = computed(() => JSON.stringify(this.draft()) !== JSON.stringify(this.saved()));

  protected readonly onSale = computed(() => this.draft().tiers.filter((t) => t.onSale));
  protected readonly capacity = computed(() => {
    const c = this.draft().maxPerHour * this.draft().hours;
    return Number.isFinite(c) ? c : 0;
  });
  protected readonly fullApps = computed(() => {
    const n = this.onSale().reduce((s, t) => s + t.appearances * t.maxPerEvent, 0);
    return Number.isFinite(n) ? n : 0;
  });
  protected readonly occupancy = computed(() =>
    this.capacity() > 0 ? `${Math.round((this.fullApps() / this.capacity()) * 100)}%` : '—',
  );
  protected readonly maxRevenue = computed(() => this.onSale().reduce((s, t) => s + t.priceCents * t.maxPerEvent, 0));
  protected readonly nexagoShare = computed(() =>
    Math.round((this.maxRevenue() * (100 - this.draft().organizerSharePct)) / 100),
  );
  protected readonly plansWithoutNarrator = computed(() =>
    this.plans().filter((p) => p.live && !p.narrator).map((p) => p.name),
  );
  protected readonly coverageHint = computed(() => {
    const hours = [...new Set(this.plans().map((p) => p.hours))];
    return hours.length === 1 ? `Cobertura dos planos: ${hours[0]}h` : 'Cobertura varia por plano';
  });

  constructor() {
    void this.load();
    inject(DestroyRef).onDestroy(() => clearTimeout(this.toastTimer));
  }

  async load(): Promise<void> {
    this.state.set('loading');
    this.saveError.set(null);
    this.conflict.set(false);
    try {
      const today = saoPauloDate(new Date());
      const [sponsors, plans] = await Promise.all([this.repo.sponsors(), this.repo.plans()]);
      this.saved.set(sponsors.value);
      this.draft.set(clone(sponsors.value));
      this.version.set(sponsors.version);
      this.plans.set(
        plans.map((e) => effectivePlan(e, today)).filter((p): p is TournamentPlan => p?.status === 'ativo'),
      );
      this.log.set(null);
      this.state.set('ready');
    } catch (error) {
      this.loadError.set(callableErrorMessage(error));
      this.state.set('error');
    }
  }

  protected tierIssues(i: number): Issues {
    const prefix = `tiers.${i}.`;
    const out: Issues = {};
    for (const [k, v] of Object.entries(this.issues())) {
      if (k.startsWith(prefix)) {
        out[k.slice(prefix.length)] = v;
      }
    }
    return out;
  }

  protected patch(patch: Partial<SponsorsConfig>): void {
    this.draft.update((s) => ({ ...s, ...patch }));
  }

  protected setTier(i: number, tier: SponsorTier): void {
    this.draft.update((s) => ({ ...s, tiers: s.tiers.map((t, j) => (j === i ? tier : t)) }));
  }

  protected addTier(): void {
    const tiers = this.draft().tiers;
    const name = `Cota ${tiers.length + 1}`;
    const tier: SponsorTier = {
      id: tierIdFor(name, tiers.map((t) => t.id)),
      name,
      color: '#5AC8FA',
      priceCents: 100_00,
      appearances: 10,
      seconds: 5,
      mentions: 0,
      maxPerEvent: 2,
      onSale: false,
    };
    this.patch({ tiers: [...tiers, tier] });
  }

  protected removeTier(i: number): void {
    this.patch({ tiers: this.draft().tiers.filter((_, j) => j !== i) });
  }

  protected setBool(key: BoolKey, value: boolean): void {
    this.draft.update((s) => ({ ...s, [key]: value }));
  }

  protected whole(v: unknown): number {
    return typeof v === 'number' ? v : NaN;
  }

  protected discard(): void {
    this.draft.set(clone(this.saved()));
    this.saveError.set(null);
  }

  protected async save(): Promise<void> {
    if (!this.dirty() || this.issueCount() > 0) {
      return;
    }
    this.saving.set(true);
    this.saveError.set(null);
    this.conflict.set(false);
    try {
      const out = await this.repo.saveSponsors(this.draft(), this.version());
      this.saved.set(out.value);
      this.draft.set(clone(out.value));
      this.version.set(out.version);
      this.log.set(null);
      this.showToast(`Sponsors salvo · v${out.version}`);
    } catch (error) {
      this.saveError.set(saveErrorText(error));
      this.conflict.set(isVersionConflict(error));
    } finally {
      this.saving.set(false);
    }
  }

  protected share(t: SponsorTier): number {
    const total = Math.max(this.capacity(), this.fullApps(), 1);
    return Math.min(100, ((t.appearances * t.maxPerEvent) / total) * 100);
  }

  protected async openLog(): Promise<void> {
    this.logOpen.set(true);
    if (this.log() !== null) {
      return;
    }
    this.logError.set(null);
    try {
      this.log.set((await this.repo.log()).filter((e) => e.scope === 'sponsors'));
    } catch (error) {
      this.logError.set(callableErrorMessage(error));
    }
  }

  canLeave(): boolean | Promise<boolean> {
    if (!this.dirty() || !this.canEdit()) {
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
    if (this.dirty() && this.canEdit()) {
      event.preventDefault();
    }
  }

  private showToast(text: string): void {
    clearTimeout(this.toastTimer);
    this.toast.set(text);
    this.toastTimer = setTimeout(() => this.toast.set(null), 4000);
  }
}
