import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../../auth/auth.service';
import { callableErrorMessage } from '../../../data/callable-error';
import { ConfirmDialogComponent } from '../../../ui/confirm-dialog.component';
import { IconComponent } from '../../../ui/icon.component';
import { PanelCardComponent } from '../../../ui/panel-card.component';
import { PanelShellComponent } from '../../../ui/panel-shell.component';
import { isVersionConflict, saveErrorText } from '../data/save-errors';
import {
  DEFAULT_RULES,
  DEFAULT_SPONSORS,
  STATUS_LABEL,
  brl,
  clone,
  dayLabel,
  latestPublished,
  marginCents,
  marginPct,
  marginTone,
  newPlanFrom,
  normalizeDraft,
  planCost,
  planDiffs,
  samePlan,
  saoPauloDate,
  suggestedPrice,
  validatePlan,
  type PlanEntry,
  type PlanRules,
  type SponsorsConfig,
  type TournamentPlan,
} from '../data/tournament-plans';
import { TournamentPlansRepository } from '../data/tournament-plans.repository';
import { MarginBarComponent } from '../ui/margin-bar.component';
import { EventSimulatorComponent } from './event-simulator.component';
import { PlanFormComponent } from './plan-form.component';
import { PlanPreviewComponent } from './plan-preview.component';
import { PublishDialogComponent, type PublishChoice } from './publish-dialog.component';

const SUGGESTED_CITIES = ['Goiânia', 'Brasília', 'Rio de Janeiro', 'São Paulo', 'Florianópolis'];

/**
 * Torneios › Planos › editar (tela 02) e publicar (tela 03). O rascunho local nasce do rascunho
 * salvo ou da última versão publicada; "Salvar rascunho" grava sem mudar a versão e "Publicar"
 * cria a N+1, agora ou a partir de uma data.
 */
@Component({
  selector: 'bo-plan-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:beforeunload)': 'onBeforeUnload($event)' },
  imports: [
    RouterLink,
    PanelShellComponent,
    PanelCardComponent,
    IconComponent,
    ConfirmDialogComponent,
    MarginBarComponent,
    PlanFormComponent,
    PlanPreviewComponent,
    EventSimulatorComponent,
    PublishDialogComponent,
  ],
  template: `
    <bo-panel-shell>
      <header class="head">
        <div class="titles">
          <nav class="crumb" aria-label="Caminho">
            <a routerLink="/painel/torneios/planos">Planos</a>
            <bo-icon name="chevron-right" [size]="12" />
            <span>{{ draft().name || 'Sem nome' }}</span>
          </nav>
          <h1>{{ draft().name || 'Sem nome' }}</h1>
          @if (state() === 'ready') {
            <span class="sub">{{ subtitle() }}</span>
          }
        </div>
        <div class="spacer"></div>
        @if (canEdit() && state() === 'ready') {
          <button type="button" class="bo-ghost-btn" [disabled]="busy() || !canDiscard()" (click)="discardOpen.set(true)">Descartar</button>
          <button type="button" class="bo-mini-btn" [disabled]="busy() || !localDirty() || invalid()" (click)="saveDraft()">Salvar rascunho</button>
          <button type="button" class="bo-mini-btn bo-mini-btn-primary" [disabled]="busy() || diffs().length === 0" (click)="requestPublish()">
            {{ isNew() ? 'Publicar plano' : 'Publicar alterações' }}
          </button>
        }
      </header>

      <div class="body">
        @if (feedback(); as f) {
          <div class="bo-feedback" role="status"><bo-icon name="check" [size]="15" /><span>{{ f }}</span></div>
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
        @if (entry()?.next; as n) {
          <div class="sched" role="status">
            <bo-icon name="calendar" [size]="15" />
            <span>A v{{ n.version }} vale a partir de {{ day(n.effectiveFrom) }}. Publicar de novo substitui esse agendamento.</span>
          </div>
        }

        @switch (state()) {
          @case ('loading') {
            <div class="grid" aria-busy="true" aria-label="Carregando plano">
              <div class="col"><div class="skel tall"></div><div class="skel"></div></div>
              <div class="col"><div class="skel"></div><div class="skel"></div></div>
            </div>
          }
          @case ('missing') {
            <div class="bo-alert" role="alert">
              <bo-icon name="alert" [size]="16" />
              <span>Plano não encontrado. Ele pode ter sido um rascunho descartado.</span>
              <a class="bo-mini-btn push" routerLink="/painel/torneios/planos">Voltar aos planos</a>
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
              <bo-plan-form
                [plan]="draft()"
                [issues]="showIssues() ? issues() : {}"
                [readonly]="!canEdit()"
                [knownCities]="knownCities()"
                (planChange)="edit($event)"
              />
              <div class="col">
                <bo-panel-card kicker="Margem" title="Custo do pacote">
                  <div class="sum"><span>Custo fixo do evento</span><b>{{ brl(rules().fixedCostCents) }}</b></div>
                  <div class="sum"><span>{{ draft().courts }} × custo por quadra</span><b>{{ brl(draft().courts * rules().courtCostCents) }}</b></div>
                  <div class="sum"><span>Custo total</span><b>{{ brl(cost()) }}</b></div>
                  <div class="margin">
                    <span>Margem bruta</span>
                    <strong [class]="tone()">{{ brl(margin()) }} <small>· {{ pct() }}%</small></strong>
                  </div>
                  <bo-margin-bar [pct]="pct()" [min]="rules().minMarginPct" />
                  <p class="mnote">
                    @if (pct() >= rules().minMarginPct) {
                      Acima da margem mínima de {{ rules().minMarginPct }}%.
                    } @else {
                      Abaixo da margem mínima de {{ rules().minMarginPct }}%. Preço sugerido: <b>{{ brl(suggested()) }}</b>.
                    }
                  </p>
                </bo-panel-card>
                <bo-plan-preview [plan]="draft()" />
                <bo-event-simulator [plan]="draft()" [rules]="rules()" [sponsors]="sponsors()" />
              </div>
            </div>
          }
        }
      </div>

      <bo-publish-dialog
        [open]="publishOpen()"
        [planName]="draft().name || 'Sem nome'"
        [fromVersion]="entry()?.version ?? 0"
        [diffs]="diffs()"
        [today]="today"
        [busy]="saving()"
        [error]="publishError()"
        (publish)="publish($event)"
        (dismissed)="publishOpen.set(false)"
      />

      <bo-confirm-dialog
        [open]="discardOpen()"
        title="Descartar alterações?"
        [description]="discardText()"
        confirmLabel="Descartar"
        tone="danger"
        [busy]="saving()"
        (confirmed)="discard()"
        (dismissed)="discardOpen.set(false)"
      />

      <bo-confirm-dialog
        [open]="leaveOpen()"
        title="Sair sem salvar?"
        description="As alterações deste plano que não foram salvas como rascunho serão perdidas."
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
    .crumb { display: flex; align-items: center; gap: 6px; font-family: var(--nx-font-mono); font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    .crumb a { color: var(--nx-text-dim); text-decoration: none; }
    .crumb a:hover { color: var(--nx-text); }
    h1 { margin: 0; font-family: var(--nx-font-display); font-weight: 800; font-size: 21px; letter-spacing: -0.02em; overflow-wrap: anywhere; }
    .sub { font-family: var(--nx-font-mono); font-size: 12px; color: var(--nx-text-dim); }
    .spacer { flex: 1; }
    .body { flex: 1; padding: 24px 32px 40px; display: flex; flex-direction: column; gap: 16px; min-width: 0; }
    .push { margin-left: auto; flex: none; text-decoration: none; }
    .sched { display: flex; align-items: center; gap: 10px; padding: 11px 14px; border-radius: var(--nx-r-3); background: var(--nx-orange-tint); border: 1px solid rgba(255, 106, 26, 0.3); font-size: 12.5px; color: var(--nx-text); }
    .sched bo-icon { color: var(--nx-orange-500); }
    .grid { display: grid; grid-template-columns: minmax(0, 1fr) 400px; gap: 20px; align-items: start; }
    .col { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
    .sum { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--nx-line); font-size: 12.5px; }
    .sum span { color: var(--nx-text-dim); }
    .sum b { font-family: var(--nx-font-mono); font-weight: 500; }
    .margin { display: flex; justify-content: space-between; align-items: baseline; padding: 14px 0 10px; font-family: var(--nx-font-display); font-weight: 700; font-size: 13px; }
    .margin strong { font-weight: 800; font-size: 22px; }
    .margin small { font-size: 14px; }
    .green { color: var(--nx-win); }
    .yellow { color: var(--nx-pending); }
    .red { color: var(--nx-live); }
    .mnote { margin: 10px 0 0; font-size: 11.5px; line-height: 1.5; color: var(--nx-text-dim); }
    .mnote b { color: var(--nx-orange-500); }
    .skel { height: 320px; border-radius: var(--nx-r-4); background: var(--nx-surface-0); border: 1px solid var(--nx-line); }
    .skel.tall { height: 640px; }
    @media (max-width: 1180px) {
      .grid { grid-template-columns: minmax(0, 1fr); }
    }
    @media (max-width: 760px) {
      .head, .body { padding-left: 16px; padding-right: 16px; }
    }
  `,
})
export class PlanEditorComponent {
  /** Parâmetro da rota (`withComponentInputBinding`); `novo` = plano novo. */
  readonly id = input.required<string>();

  private readonly repo = inject(TournamentPlansRepository);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private feedbackTimer: ReturnType<typeof setTimeout> | undefined;

  protected readonly today = saoPauloDate(new Date());
  protected readonly brl = brl;
  protected readonly day = dayLabel;

  protected readonly state = signal<'loading' | 'ready' | 'missing' | 'error'>('loading');
  protected readonly loadError = signal('');
  protected readonly entry = signal<PlanEntry | null>(null);
  protected readonly draft = signal<TournamentPlan>(newPlanFrom(null, 0));
  protected readonly rules = signal<PlanRules>(clone(DEFAULT_RULES));
  protected readonly sponsors = signal<SponsorsConfig>(clone(DEFAULT_SPONSORS));
  protected readonly knownCities = signal<string[]>(SUGGESTED_CITIES);

  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);
  protected readonly publishError = signal<string | null>(null);
  protected readonly conflict = signal(false);
  protected readonly feedback = signal<string | null>(null);
  protected readonly showIssues = signal(false);
  protected readonly publishOpen = signal(false);
  protected readonly discardOpen = signal(false);
  protected readonly leaveOpen = signal(false);
  private leaveResolver: ((ok: boolean) => void) | null = null;
  /** Descartar já confirmou a saída: o guard não pergunta de novo. */
  private skipGuard = false;

  protected readonly canEdit = computed(() => this.auth.isSuperAdmin() || this.auth.roles().includes('admin'));
  protected readonly isNew = computed(() => (this.entry()?.version ?? 0) === 0);
  protected readonly busy = computed(() => this.saving() || this.state() !== 'ready');

  /** Última versão publicada (agendada inclusive): a base do diff. */
  private readonly base = computed(() => (this.entry() ? latestPublished(this.entry()!) : null));
  /** O que está gravado: rascunho salvo, senão a publicada. */
  private readonly saved = computed(() => this.entry()?.draft ?? this.base());

  protected readonly issues = computed(() => validatePlan(this.draft()));
  protected readonly invalid = computed(() => Object.keys(this.issues()).length > 0);
  protected readonly diffs = computed(() => planDiffs(this.base(), normalizeDraft(this.draft())));
  protected readonly localDirty = computed(() => !samePlan(this.draft(), this.saved()));
  protected readonly canDiscard = computed(() => this.localDirty() || !!this.entry()?.draft);

  protected readonly cost = computed(() => planCost(this.draft().courts, this.rules()));
  protected readonly margin = computed(() => marginCents(this.draft(), this.rules()));
  protected readonly pct = computed(() => marginPct(this.draft(), this.rules()));
  protected readonly tone = computed(() => marginTone(this.pct(), this.rules().minMarginPct));
  protected readonly suggested = computed(() => suggestedPrice(this.draft().courts, this.rules()));

  protected readonly subtitle = computed(() => {
    const e = this.entry();
    const parts: string[] = [];
    if (this.isNew()) {
      parts.push('Nunca publicado');
    } else {
      parts.push(STATUS_LABEL[this.base()?.status ?? 'ativo'], `v${e!.version}`);
    }
    const n = this.diffs().length;
    parts.push(n ? `${n} ${n > 1 ? 'alterações não publicadas' : 'alteração não publicada'}` : 'sem alterações');
    if (e?.draft && !this.localDirty()) {
      parts.push('rascunho salvo');
    }
    return parts.join(' · ');
  });

  protected readonly discardText = computed(() =>
    this.isNew()
      ? 'O plano novo ainda não foi publicado: descartar apaga o rascunho.'
      : `O plano volta para a v${this.entry()?.version} publicada${this.entry()?.draft ? ' e o rascunho salvo é apagado' : ''}.`,
  );

  constructor() {
    queueMicrotask(() => void this.load());
    inject(DestroyRef).onDestroy(() => clearTimeout(this.feedbackTimer));
  }

  async load(): Promise<void> {
    this.state.set('loading');
    this.saveError.set(null);
    this.conflict.set(false);
    try {
      const [plans, rules, sponsors] = await Promise.all([this.repo.plans(), this.repo.rules(), this.repo.sponsors()]);
      this.rules.set(rules.value);
      this.sponsors.set(sponsors.value);
      const cities = plans.flatMap((p) => latestPublished(p)?.cities ?? []);
      this.knownCities.set([...SUGGESTED_CITIES, ...cities]);
      if (this.id() === 'novo') {
        const published = plans.map((p) => latestPublished(p)).filter((p): p is TournamentPlan => p !== null);
        this.entry.set(null);
        this.draft.set(newPlanFrom(published.at(-1) ?? null, plans.length));
      } else {
        const entry = plans.find((p) => p.id === this.id()) ?? null;
        if (!entry) {
          this.state.set('missing');
          return;
        }
        this.entry.set(entry);
        this.draft.set(clone(entry.draft ?? latestPublished(entry)!));
      }
      this.showIssues.set(false);
      this.state.set('ready');
    } catch (error) {
      this.loadError.set(callableErrorMessage(error));
      this.state.set('error');
    }
  }

  protected edit(plan: TournamentPlan): void {
    this.draft.set(plan);
    this.feedback.set(null);
  }

  protected async saveDraft(): Promise<void> {
    if (this.invalid()) {
      this.showIssues.set(true);
      return;
    }
    if (await this.send('draft')) {
      this.flash('Rascunho salvo. Ele ainda não vale para ninguém.');
    }
  }

  protected requestPublish(): void {
    if (this.invalid()) {
      this.showIssues.set(true);
      this.saveError.set('Corrija os campos marcados antes de publicar.');
      return;
    }
    this.saveError.set(null);
    this.publishError.set(null);
    this.publishOpen.set(true);
  }

  protected async publish(choice: PublishChoice): Promise<void> {
    const ok = await this.send('publish', choice.effectiveFrom);
    if (ok) {
      this.publishOpen.set(false);
      const v = this.entry()!.version;
      this.flash(choice.effectiveFrom ? `v${v} agendada para ${dayLabel(choice.effectiveFrom)}.` : `v${v} publicada.`);
    }
  }

  protected async discard(): Promise<void> {
    const e = this.entry();
    if (e?.draft) {
      const ok = await this.send('discardDraft');
      this.discardOpen.set(false);
      if (!ok) {
        return;
      }
      if (e.version === 0) {
        this.skipGuard = true;
        void this.router.navigateByUrl('/painel/torneios/planos');
        return;
      }
    } else {
      this.discardOpen.set(false);
      if (!e) {
        // Plano novo que nem virou rascunho: não há para onde voltar além da lista.
        this.skipGuard = true;
        void this.router.navigateByUrl('/painel/torneios/planos');
        return;
      }
    }
    const base = this.base();
    this.draft.set(base ? clone(base) : newPlanFrom(null, 0));
    this.showIssues.set(false);
    this.saveError.set(null);
  }

  /** Grava pela callable; erros vão para o modal de publicação ou para o topo. */
  private async send(action: 'draft' | 'publish' | 'discardDraft', effectiveFrom: string | null = null): Promise<boolean> {
    const e = this.entry();
    this.saving.set(true);
    this.saveError.set(null);
    this.publishError.set(null);
    this.conflict.set(false);
    try {
      const out = await this.repo.savePlan({
        planId: e?.id ?? null,
        action,
        plan: action === 'discardDraft' ? undefined : normalizeDraft(this.draft()),
        version: e?.version ?? 0,
        effectiveFrom,
      });
      const entry: PlanEntry = {
        id: out.planId,
        order: e?.order ?? 99,
        version: out.version,
        current: out.current,
        next: out.next,
        draft: out.draft,
        updatedAt: new Date(),
        updatedBy: this.auth.displayName() || null,
      };
      this.entry.set(entry);
      if (action !== 'discardDraft') {
        this.draft.set(clone(entry.draft ?? latestPublished(entry) ?? this.draft()));
      }
      if (!e && action !== 'discardDraft') {
        void this.router.navigate(['/painel/torneios/planos', out.planId], { replaceUrl: true });
      }
      return true;
    } catch (error) {
      const text = saveErrorText(error);
      if (action === 'publish') {
        this.publishError.set(text);
      } else {
        this.saveError.set(text);
      }
      this.conflict.set(isVersionConflict(error));
      if (isVersionConflict(error)) {
        this.publishOpen.set(false);
        this.saveError.set(text);
      }
      return false;
    } finally {
      this.saving.set(false);
    }
  }

  /** Guard de rota (`canDeactivate`): o que não virou rascunho pergunta antes de sair. */
  canLeave(): boolean | Promise<boolean> {
    if (this.skipGuard || !this.localDirty() || !this.canEdit() || this.state() !== 'ready') {
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
    if (this.localDirty() && this.canEdit() && this.state() === 'ready') {
      event.preventDefault();
    }
  }

  private flash(text: string): void {
    clearTimeout(this.feedbackTimer);
    this.feedback.set(text);
    this.feedbackTimer = setTimeout(() => this.feedback.set(null), 5000);
  }
}
