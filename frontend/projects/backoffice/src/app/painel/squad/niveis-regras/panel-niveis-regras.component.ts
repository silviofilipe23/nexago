import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { AuthService } from '../../../auth/auth.service';
import { callableErrorMessage } from '../../data/callable-error';
import { ConfirmDialogComponent } from '../../ui/confirm-dialog.component';
import { IconComponent } from '../../ui/icon.component';
import { PanelShellComponent } from '../../ui/panel-shell.component';
import {
  DEFAULT_SQUAD_RULES,
  affectsContracts,
  cloneRules,
  sameRules,
  validateRules,
  versionLabel,
  type AthletePoints,
  type AttributionRules,
  type PromotionRule,
  type ScoreComponent,
  type SquadRules,
  type TerminationRule,
} from './data/squad-rules';
import {
  SquadRulesRepository,
  type KitSkuOption,
  type RulesVersion,
} from './data/squad-rules.repository';
import { AthletePointsCardComponent } from './ui/athlete-points-card.component';
import { AttributionCardComponent } from './ui/attribution-card.component';
import { PromotionCardComponent } from './ui/promotion-card.component';
import { ScoreWeightsCardComponent } from './ui/score-weights-card.component';
import { TierPackagesCardComponent, type TierPatch } from './ui/tier-packages-card.component';
import { VersionsDrawerComponent } from './ui/versions-drawer.component';

/** `not-found` cru ("NOT FOUND") é callable que ainda não foi publicada, não registro sumido. */
function errorText(error: unknown): string {
  const code = String((error as { code?: unknown })?.code ?? '');
  const message = String((error as { message?: unknown })?.message ?? '');
  if (code.includes('not-found')) {
    return message && message !== 'NOT FOUND' ? message : 'Função ainda não publicada no servidor.';
  }
  return callableErrorMessage(error);
}

function isConflict(error: unknown): boolean {
  return String((error as { code?: unknown })?.code ?? '').includes('failed-precondition');
}

/** Retrato da v1 quando ninguém salvou ainda: o histórico começa no piloto. */
const PILOT_VERSION: RulesVersion = {
  version: 1,
  rules: DEFAULT_SQUAD_RULES,
  createdAt: null,
  createdBy: null,
  note: 'Padrão do piloto',
  changes: [],
  affectsContracts: false,
  restoredFrom: null,
};

/**
 * Squad › Níveis & regras (tela 06). Rascunho local sobre a versão vigente; salvar cria a
 * versão N+1. Pacote por nível vale para contratos novos (os assinados guardam a versão);
 * atribuição, Score e pontos valem para todos a partir do salvamento.
 */
@Component({
  selector: 'bo-panel-niveis-regras',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:beforeunload)': 'onBeforeUnload($event)' },
  imports: [
    PanelShellComponent,
    IconComponent,
    ConfirmDialogComponent,
    TierPackagesCardComponent,
    AttributionCardComponent,
    PromotionCardComponent,
    ScoreWeightsCardComponent,
    AthletePointsCardComponent,
    VersionsDrawerComponent,
  ],
  template: `
    <bo-panel-shell>
      <header class="head">
        <div class="titles">
          <div class="crumb">Squad</div>
          <div class="title-row">
            <h1>Níveis &amp; regras</h1>
            @if (state() === 'ready') {
              <span class="ver">{{ versionText() }} · vale para o piloto</span>
            }
          </div>
        </div>
        <div class="spacer"></div>
        <button type="button" class="bo-mini-btn" [disabled]="state() !== 'ready'" (click)="openHistory()">
          <bo-icon name="history" [size]="13" /> Histórico de versões
        </button>
        @if (canEdit()) {
          <button type="button" class="bo-mini-btn bo-mini-btn-primary" [disabled]="!canSave()" (click)="requestSave()">
            Salvar alterações
          </button>
        }
      </header>

      <div class="body">
        @if (restoredFrom(); as v) {
          <div class="bo-feedback" role="status">
            <bo-icon name="history" [size]="15" />
            <span>Conteúdo da {{ label(v) }} carregado. Salve para criar a {{ label(version() + 1) }}.</span>
          </div>
        }
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
            <div class="grid" aria-busy="true" aria-label="Carregando regras">
              <div class="col"><div class="skel tall"></div><div class="skel"></div></div>
              <div class="col"><div class="skel"></div><div class="skel"></div><div class="skel short"></div></div>
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
            <div class="grid">
              <div class="col">
                <bo-tier-packages-card
                  [tiers]="draft().tiers"
                  [marginMaxPct]="draft().marginMaxPct"
                  [issues]="issues()"
                  [skus]="skus()"
                  [readonly]="!canEdit()"
                  (tierChange)="patchTier($event)"
                  (marginChange)="patch({ marginMaxPct: $event })"
                />
                <bo-attribution-card
                  [value]="draft().attribution"
                  [issues]="issues()"
                  [readonly]="!canEdit()"
                  (valueChange)="setAttribution($event)"
                />
              </div>
              <div class="col">
                <bo-promotion-card
                  [promotion]="draft().promotion"
                  [termination]="draft().termination"
                  [issues]="issues()"
                  [readonly]="!canEdit()"
                  (promotionChange)="setPromotion($event)"
                  (terminationChange)="setTermination($event)"
                />
                <bo-score-weights-card
                  [weights]="draft().scoreWeights"
                  [issues]="issues()"
                  [readonly]="!canEdit()"
                  (weightsChange)="setWeights($event)"
                />
                <bo-athlete-points-card
                  [value]="draft().points"
                  [issues]="issues()"
                  [readonly]="!canEdit()"
                  (valueChange)="setPoints($event)"
                />
              </div>
            </div>
          }
        }
      </div>

      @if (dirty() && canEdit()) {
        <div class="unsaved" role="region" aria-label="Alterações não salvas">
          <span class="dot" aria-hidden="true"></span>
          <span class="msg">
            Você tem alterações não salvas
            @if (showIssues() && issueCount() > 0) {
              <em>· corrija {{ issueCount() === 1 ? 'o campo marcado' : 'os ' + issueCount() + ' campos marcados' }}</em>
            }
          </span>
          <button type="button" class="bo-mini-btn" [disabled]="saving()" (click)="discard()">Descartar</button>
          <button type="button" class="bo-mini-btn bo-mini-btn-primary" [disabled]="!canSave()" (click)="requestSave()">
            Salvar
          </button>
        </div>
      }

      @if (toast(); as t) {
        <div class="toast" role="status"><bo-icon name="check" [size]="15" /> {{ t }}</div>
      }

      @if (historyOpen()) {
        <bo-versions-drawer
          [versions]="versions()"
          [error]="versionsError()"
          [current]="version()"
          [canRestore]="canEdit()"
          (restore)="restore($event)"
          (closed)="historyOpen.set(false)"
        />
      }

      <bo-confirm-dialog
        [open]="confirmOpen()"
        [title]="'Salvar como ' + label(version() + 1) + '?'"
        [description]="
          'Essa mudança vale para novos contratos e renovações. Os contratos já assinados seguem na ' +
          label(version()) +
          '.'
        "
        [confirmLabel]="'Salvar ' + label(version() + 1)"
        [busy]="saving()"
        (confirmed)="save()"
        (dismissed)="confirmOpen.set(false)"
      />

      <bo-confirm-dialog
        [open]="leaveOpen()"
        title="Sair sem salvar?"
        description="As alterações nas regras serão descartadas."
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
    .title-row { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
    h1 { margin: 0; font-family: var(--nx-font-display); font-weight: 800; font-size: 21px; letter-spacing: -0.02em; }
    .ver { font-family: var(--nx-font-mono); font-size: 12px; color: var(--nx-text-dim); }
    .spacer { flex: 1; }
    .body { flex: 1; padding: 20px 32px 32px; display: flex; flex-direction: column; gap: 16px; min-width: 0; }
    .push { margin-left: auto; flex: none; }
    .grid { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr); gap: 16px; align-items: start; }
    .col { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
    .skel { height: 300px; border-radius: var(--nx-r-4); background: var(--nx-surface-0); border: 1px solid var(--nx-line); }
    .skel.tall { height: 620px; }
    .skel.short { height: 180px; }

    .unsaved { position: sticky; bottom: 16px; z-index: 20; margin: 0 32px 16px; display: flex; align-items: center; gap: 10px; padding: 10px 12px 10px 16px; border-radius: var(--nx-r-3); background: var(--nx-surface-1); border: 1px solid rgba(255, 106, 26, 0.35); box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5); }
    .dot { width: 8px; height: 8px; flex: none; border-radius: 50%; background: var(--nx-orange-500); }
    .msg { flex: 1; min-width: 0; font-family: var(--nx-font-display); font-weight: 600; font-size: 13px; }
    .msg em { font-style: normal; font-weight: 500; color: var(--nx-live); }
    .toast { position: fixed; right: 24px; bottom: 24px; z-index: 50; display: flex; align-items: center; gap: 8px; padding: 12px 16px; border-radius: var(--nx-r-3); background: var(--nx-surface-1); border: 1px solid rgba(43, 209, 126, 0.4); color: var(--nx-text); font-family: var(--nx-font-display); font-weight: 600; font-size: 13px; box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5); }
    .toast bo-icon { color: var(--nx-win); }

    @media (max-width: 1180px) {
      .grid { grid-template-columns: minmax(0, 1fr); }
    }
    @media (max-width: 760px) {
      .head, .body { padding-left: 16px; padding-right: 16px; }
      .unsaved { margin: 0 16px 16px; flex-wrap: wrap; }
    }
  `,
})
export class PanelNiveisRegrasComponent {
  private readonly repo = inject(SquadRulesRepository);
  private readonly auth = inject(AuthService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private toastTimer: ReturnType<typeof setTimeout> | undefined;

  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly loadError = signal('');
  protected readonly version = signal(1);
  private readonly saved = signal<SquadRules>(cloneRules(DEFAULT_SQUAD_RULES));
  protected readonly draft = signal<SquadRules>(cloneRules(DEFAULT_SQUAD_RULES));
  protected readonly skus = signal<KitSkuOption[] | null>(null);
  /** Versão de onde veio o rascunho, quando ele nasceu de "Restaurar". */
  protected readonly restoredFrom = signal<number | null>(null);

  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);
  protected readonly conflict = signal(false);
  protected readonly confirmOpen = signal(false);
  protected readonly showIssues = signal(false);
  protected readonly toast = signal<string | null>(null);

  protected readonly historyOpen = signal(false);
  protected readonly versions = signal<RulesVersion[] | null>(null);
  protected readonly versionsError = signal<string | null>(null);

  protected readonly leaveOpen = signal(false);
  private leaveResolver: ((ok: boolean) => void) | null = null;

  protected readonly label = versionLabel;
  protected readonly versionText = computed(() => versionLabel(this.version()));
  protected readonly issues = computed(() => validateRules(this.draft()));
  protected readonly issueCount = computed(() => Object.keys(this.issues()).length);
  protected readonly dirty = computed(() => !sameRules(this.draft(), this.saved()));

  /** Admin e Growth editam; o resto vê em modo leitura. Quem decide de verdade é a callable. */
  protected readonly canEdit = computed(
    () => this.auth.isSuperAdmin() || this.auth.roles().some((r) => r === 'admin' || r === 'growth'),
  );

  /** Pesos fora de 100 travam o botão; os outros erros levam ao campo no clique. */
  protected readonly canSave = computed(
    () =>
      this.canEdit() &&
      this.state() === 'ready' &&
      this.dirty() &&
      !this.saving() &&
      this.issues()['scoreWeights.total'] === undefined,
  );

  constructor() {
    void this.load();
    this.repo
      .kitSkus()
      .then((skus) => this.skus.set(skus))
      .catch(() => this.skus.set([]));
    inject(DestroyRef).onDestroy(() => clearTimeout(this.toastTimer));
  }

  async load(): Promise<void> {
    this.state.set('loading');
    this.saveError.set(null);
    this.conflict.set(false);
    try {
      const { rules, version } = await this.repo.load();
      this.saved.set(rules);
      this.draft.set(cloneRules(rules));
      this.version.set(version);
      this.restoredFrom.set(null);
      this.versions.set(null);
      this.state.set('ready');
    } catch (error) {
      this.loadError.set(callableErrorMessage(error));
      this.state.set('error');
    }
  }

  protected patch(patch: Partial<SquadRules>): void {
    this.draft.update((r) => ({ ...r, ...patch }));
  }

  protected patchTier({ tier, patch }: TierPatch): void {
    this.draft.update((r) => ({ ...r, tiers: { ...r.tiers, [tier]: { ...r.tiers[tier], ...patch } } }));
  }

  protected setAttribution(attribution: AttributionRules): void {
    this.patch({ attribution });
  }

  protected setPromotion(promotion: PromotionRule[]): void {
    this.patch({ promotion });
  }

  protected setTermination(termination: TerminationRule): void {
    this.patch({ termination });
  }

  protected setWeights(scoreWeights: Record<ScoreComponent, number>): void {
    this.patch({ scoreWeights });
  }

  protected setPoints(points: AthletePoints): void {
    this.patch({ points });
  }

  protected discard(): void {
    this.draft.set(cloneRules(this.saved()));
    this.restoredFrom.set(null);
    this.showIssues.set(false);
    this.saveError.set(null);
  }

  protected requestSave(): void {
    if (!this.canSave()) {
      return;
    }
    if (this.issueCount() > 0) {
      this.showIssues.set(true);
      this.scrollToFirstIssue();
      return;
    }
    if (affectsContracts(this.saved(), this.draft())) {
      this.confirmOpen.set(true);
      return;
    }
    void this.save();
  }

  protected async save(): Promise<void> {
    this.saving.set(true);
    this.saveError.set(null);
    this.conflict.set(false);
    try {
      const out = await this.repo.save(this.draft(), this.version(), this.restoredFrom());
      this.saved.set(out.rules);
      this.draft.set(cloneRules(out.rules));
      this.version.set(out.version);
      this.restoredFrom.set(null);
      this.versions.set(null);
      this.showIssues.set(false);
      this.showToast(`Regras salvas · ${versionLabel(out.version)}`);
    } catch (error) {
      this.saveError.set(errorText(error));
      this.conflict.set(isConflict(error));
    } finally {
      this.saving.set(false);
      this.confirmOpen.set(false);
    }
  }

  protected async openHistory(): Promise<void> {
    this.historyOpen.set(true);
    if (this.versions() !== null) {
      return;
    }
    this.versionsError.set(null);
    try {
      const list = await this.repo.versions();
      this.versions.set(list.length > 0 ? list : [PILOT_VERSION]);
    } catch (error) {
      this.versionsError.set(callableErrorMessage(error));
    }
  }

  protected restore(v: RulesVersion): void {
    this.historyOpen.set(false);
    if (sameRules(v.rules, this.saved())) {
      this.discard();
      this.showToast(`A ${versionLabel(v.version)} tem as mesmas regras da vigente`);
      return;
    }
    this.draft.set(cloneRules(v.rules));
    this.restoredFrom.set(v.version);
  }

  /** Guard de rota (`canDeactivate`): rascunho sujo pergunta antes de sair. */
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

  private scrollToFirstIssue(): void {
    // Depois do próximo render: o "Mais benefícios" com erro abre sozinho.
    setTimeout(() => {
      const el = this.host.nativeElement.querySelector<HTMLElement>('[aria-invalid="true"], .err');
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      if (el instanceof HTMLInputElement) {
        el.focus({ preventScroll: true });
      }
    });
  }

  private showToast(text: string): void {
    clearTimeout(this.toastTimer);
    this.toast.set(text);
    this.toastTimer = setTimeout(() => this.toast.set(null), 4000);
  }
}
