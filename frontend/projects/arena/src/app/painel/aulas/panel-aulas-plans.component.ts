import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { ArenaAccessService } from '../data/arena-access.service';
import { ArenaContextService } from '../data/arena-context.service';
import { arenaFirestore } from '../data/firestore';
import { arenaFunctions } from '../data/functions';
import { IconComponent } from '../ui/icon.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PillComponent } from '../ui/pill.component';
import { AulasPageComponent } from './aulas-ui';
import {
  PLAN_GROUP_LABEL,
  PLAN_KIND_LABEL,
  brl,
  parsePrice,
  planDetail,
  planPriceUnit,
  type ClassPlan,
  type Enrollment,
  type PlanKind,
} from './billing.model';
import { fetchEnrollments, fetchPlans, upsertPlan } from './billing-repository';

interface PlanDraft {
  planId: string | null;
  name: string;
  kind: PlanKind;
  price: string;
  classesPerWeek: number;
  makeupsPerMonth: number;
  credits: number;
  validityDays: number;
  description: string;
  status: 'active' | 'archived';
}

const EMPTY: PlanDraft = {
  planId: null, name: '', kind: 'monthly', price: '', classesPerWeek: 2, makeupsPerMonth: 2,
  credits: 8, validityDays: 60, description: '', status: 'active',
};

/** 13 · Planos e pacotes — mensalidades (aulas/semana), pacotes de créditos e avulsas. Mudar o
 *  valor vale para matrículas novas; as atuais guardam o valor de quando matricularam. */
@Component({
  selector: 'ar-panel-aulas-plans',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AulasPageComponent, PanelCardComponent, PillComponent, IconComponent],
  styleUrl: './aulas-form.scss',
  template: `
    <ar-aulas-page title="Aulas" subtitle="Mensalidades, pacotes de créditos e aulas avulsas" tab="planos" [empty]="!loading() && plans().length === 0">
      <button page-actions type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="readOnly()" (click)="openNew()">
        <ar-icon name="plus" [size]="14" />
        Criar plano
      </button>

      @if (loading()) {
        <p class="state-text">Carregando planos…</p>
      } @else if (loadError(); as err) {
        <p class="state-text">{{ err }}</p>
      } @else {
        <div class="layout">
          <div class="groups">
            @for (g of groups; track g) {
              <section>
                <div class="kicker">{{ groupLabel[g] }}</div>
                <div class="grid">
                  @for (p of plansOf(g); track p.id) {
                    <div class="plan" [class.selected]="draft()?.planId === p.id" [class.archived]="p.status === 'archived'">
                      <div class="plan-name">{{ p.name }}</div>
                      <div class="plan-price">{{ p.priceReais > 0 ? brl(p.priceReais) : 'Grátis' }}<span>{{ unit(p.kind) }}</span></div>
                      <div class="plan-detail">{{ detail(p) }}</div>
                      <div class="plan-foot">
                        <span>{{ activeCount(p.id) }} aluno{{ activeCount(p.id) === 1 ? '' : 's' }} ativo{{ activeCount(p.id) === 1 ? '' : 's' }}</span>
                        @if (p.status === 'archived') {
                          <ar-pill tone="dim">Arquivado</ar-pill>
                        }
                        <button type="button" class="ar-ghost-btn" [disabled]="readOnly()" (click)="openEdit(p)">Editar</button>
                      </div>
                    </div>
                  } @empty {
                    <p class="hint first">Nenhum plano {{ groupLabel[g].toLowerCase() }}.</p>
                  }
                </div>
              </section>
            }
          </div>

          <ar-panel-card [title]="draft()?.planId ? 'Editar plano' : 'Novo plano'" [kicker]="draft()?.name || 'Plano'">
            @if (draft(); as d) {
              @if (saveError(); as err) {
                <div class="error-banner">{{ err }}</div>
              }
              <div class="field-label">Nome</div>
              <input class="input-box" type="text" maxlength="60" placeholder="Ex.: Mensal 2x/semana" [value]="d.name" (input)="patch({ name: $any($event.target).value })" />
              <div class="field-label spaced">Tipo</div>
              <div class="chip-row">
                @for (k of groups; track k) {
                  <button type="button" class="ar-chip" [class.active]="d.kind === k" [disabled]="d.planId != null" (click)="patch({ kind: k })">{{ kindLabel[k] }}</button>
                }
              </div>
              <div class="row-2">
                <div>
                  <div class="field-label spaced">Valor (R$){{ unit(d.kind) }}</div>
                  <input class="input-box" type="text" inputmode="decimal" placeholder="320,00" [value]="d.price" (input)="patch({ price: $any($event.target).value })" />
                </div>
                @if (d.kind === 'monthly') {
                  <div>
                    <div class="field-label spaced">Aulas por semana</div>
                    <div class="stepper">
                      <span>{{ d.classesPerWeek }}x</span>
                      <button type="button" aria-label="Menos" (click)="patch({ classesPerWeek: Math.max(1, d.classesPerWeek - 1) })">–</button>
                      <button type="button" aria-label="Mais" (click)="patch({ classesPerWeek: Math.min(7, d.classesPerWeek + 1) })">+</button>
                    </div>
                  </div>
                } @else if (d.kind === 'package') {
                  <div>
                    <div class="field-label spaced">Créditos (aulas)</div>
                    <input class="input-box" type="number" min="1" max="100" [value]="d.credits" (input)="patch({ credits: +$any($event.target).value })" />
                  </div>
                }
              </div>
              @if (d.kind === 'monthly') {
                <div class="field-label spaced">Reposições por mês</div>
                <div class="stepper">
                  <span>{{ d.makeupsPerMonth }}</span>
                  <button type="button" aria-label="Menos" (click)="patch({ makeupsPerMonth: Math.max(0, d.makeupsPerMonth - 1) })">–</button>
                  <button type="button" aria-label="Mais" (click)="patch({ makeupsPerMonth: Math.min(10, d.makeupsPerMonth + 1) })">+</button>
                </div>
                <p class="hint">Faltas justificadas viram crédito até esse limite no mês.</p>
              } @else if (d.kind === 'package') {
                <div class="field-label spaced">Validade (dias)</div>
                <input class="input-box" type="number" min="1" max="365" [value]="d.validityDays" (input)="patch({ validityDays: +$any($event.target).value })" />
                <p class="hint">Cada aula com presença (ou falta sem aviso) consome 1 crédito.</p>
              } @else {
                <p class="hint">Plano avulso fica no catálogo; a matrícula usa mensalidades e pacotes.</p>
              }
              <div class="field-label spaced">Descrição (opcional)</div>
              <input class="input-box" type="text" maxlength="120" [value]="d.description" (input)="patch({ description: $any($event.target).value })" />
              @if (d.planId) {
                <p class="hint">Mudar o valor vale para matrículas novas — quem já está matriculado mantém o valor de quando entrou.</p>
              }
              <div class="modal-actions">
                @if (d.planId) {
                  <button type="button" class="ar-mini-btn" [disabled]="saving()" (click)="toggleArchive()">{{ d.status === 'archived' ? 'Reativar' : 'Arquivar' }}</button>
                  <span class="grow"></span>
                }
                <button type="button" class="ar-mini-btn" [disabled]="saving()" (click)="draft.set(null)">Cancelar</button>
                <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="saving() || !canSave()" (click)="save()">{{ saving() ? 'Salvando…' : 'Salvar' }}</button>
              </div>
            } @else {
              <p class="hint first">Escolha um plano para editar ou crie um novo.</p>
            }
          </ar-panel-card>
        </div>
      }
    </ar-aulas-page>
  `,
  styles: `
    .state-text { font-size: 13.5px; color: var(--nx-text-mute); margin: 0; }
    .layout { display: grid; grid-template-columns: minmax(0, 1fr) 380px; gap: 16px; align-items: start; }
    .groups { display: flex; flex-direction: column; gap: 18px; min-width: 0; }
    .kicker { font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; color: var(--nx-text-dim); margin-bottom: 10px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 12px; }
    .plan { padding: 16px; border-radius: var(--nx-r-4); background: var(--nx-surface-0); border: 1px solid var(--nx-line); display: flex; flex-direction: column; gap: 6px; }
    .plan.selected { border-color: rgba(255, 106, 26, 0.5); }
    .plan.archived { opacity: 0.55; }
    .plan-name { font-family: var(--nx-font-display); font-weight: 700; font-size: 14px; color: var(--nx-text); }
    .plan-price { font-family: var(--nx-font-display); font-weight: 800; font-size: 22px; color: var(--nx-orange-500); }
    .plan-price span { font-family: var(--nx-font-mono); font-size: 10.5px; font-weight: 500; color: var(--nx-text-dim); margin-left: 3px; }
    .plan-detail { font-family: var(--nx-font-mono); font-size: 10.5px; color: var(--nx-text-dim); }
    .plan-foot { display: flex; align-items: center; gap: 8px; margin-top: 6px; padding-top: 10px; border-top: 1px solid var(--nx-line); font-size: 12px; color: var(--nx-text-mute); }
    .plan-foot span:first-child { flex: 1; }
    .first { margin-top: 0; }
    .grow { flex: 1; }
    @media (max-width: 1180px) { .layout { grid-template-columns: minmax(0, 1fr); } }
  `,
})
export class PanelAulasPlansComponent {
  private readonly arenaContext = inject(ArenaContextService);
  private readonly access = inject(ArenaAccessService);

  protected readonly Math = Math;
  protected readonly groups: readonly PlanKind[] = ['monthly', 'package', 'single'];
  protected readonly groupLabel = PLAN_GROUP_LABEL;
  protected readonly kindLabel = PLAN_KIND_LABEL;
  protected readonly brl = brl;
  protected readonly detail = planDetail;
  protected readonly unit = planPriceUnit;
  protected readonly readOnly = computed(() => !this.access.canWrite('agenda') || !this.arenaContext.hasCapability('aulas'));

  protected readonly plans = signal<ClassPlan[]>([]);
  private readonly enrollments = signal<Enrollment[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly draft = signal<PlanDraft | null>(null);
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);

  private readonly activeByPlan = computed(() => {
    const out = new Map<string, number>();
    for (const e of this.enrollments()) {
      if (e.status === 'active') out.set(e.plan.planId, (out.get(e.plan.planId) ?? 0) + 1);
    }
    return out;
  });
  protected readonly canSave = computed(() => {
    const d = this.draft();
    if (!d || d.name.trim().length < 2) return false;
    const price = parsePrice(d.price);
    return Number.isFinite(price) && (d.kind === 'single' ? price >= 0 : price > 0);
  });

  constructor() {
    effect(() => {
      const arenaId = this.arenaContext.arenaId();
      if (arenaId) void this.load(arenaId);
    });
  }

  private async load(arenaId: string): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const db = arenaFirestore();
      const [plans, enrollments] = await Promise.all([fetchPlans(db, arenaId), fetchEnrollments(db, arenaId)]);
      this.plans.set(plans);
      this.enrollments.set(enrollments);
    } catch {
      this.loadError.set('Não foi possível carregar os planos.');
    } finally {
      this.loading.set(false);
    }
  }

  protected plansOf(kind: PlanKind): ClassPlan[] {
    return this.plans().filter((p) => p.kind === kind);
  }

  protected activeCount(planId: string): number {
    return this.activeByPlan().get(planId) ?? 0;
  }

  protected openNew(): void {
    if (this.readOnly()) return;
    this.saveError.set(null);
    this.draft.set({ ...EMPTY });
  }

  protected openEdit(p: ClassPlan): void {
    if (this.readOnly()) return;
    this.saveError.set(null);
    this.draft.set({
      planId: p.id, name: p.name, kind: p.kind, price: String(p.priceReais).replace('.', ','),
      classesPerWeek: p.classesPerWeek ?? 2, makeupsPerMonth: p.makeupsPerMonth ?? 0,
      credits: p.credits ?? 8, validityDays: p.validityDays ?? 60, description: p.description ?? '', status: p.status,
    });
  }

  protected patch(change: Partial<PlanDraft>): void {
    const d = this.draft();
    if (d) this.draft.set({ ...d, ...change });
  }

  protected save(): Promise<void> {
    return this.persist(this.draft()?.status ?? 'active');
  }

  protected toggleArchive(): Promise<void> {
    return this.persist(this.draft()?.status === 'archived' ? 'active' : 'archived');
  }

  private async persist(status: 'active' | 'archived'): Promise<void> {
    const d = this.draft();
    const arenaId = this.arenaContext.arenaId();
    if (!d || !arenaId || this.readOnly()) return;
    this.saving.set(true);
    this.saveError.set(null);
    try {
      await upsertPlan(arenaFunctions(), {
        arenaId,
        planId: d.planId ?? undefined,
        name: d.name.trim(),
        kind: d.kind,
        priceReais: parsePrice(d.price),
        classesPerWeek: d.kind === 'monthly' ? d.classesPerWeek : null,
        makeupsPerMonth: d.kind === 'monthly' ? d.makeupsPerMonth : null,
        credits: d.kind === 'package' ? d.credits : null,
        validityDays: d.kind === 'package' ? d.validityDays : null,
        description: d.description.trim() || null,
        status,
      });
      this.draft.set(null);
      await this.load(arenaId);
    } catch (err) {
      this.saveError.set(err instanceof Error ? err.message : 'Não foi possível salvar o plano.');
    } finally {
      this.saving.set(false);
    }
  }
}
