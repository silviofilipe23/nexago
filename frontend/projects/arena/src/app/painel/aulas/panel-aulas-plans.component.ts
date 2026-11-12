import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ArenaAccessService } from '../data/arena-access.service';
import { ArenaContextService } from '../data/arena-context.service';
import { arenaFirestore } from '../data/firestore';
import { IconComponent } from '../ui/icon.component';
import { PillComponent } from '../ui/pill.component';
import { AulasPageComponent } from './aulas-ui';
import { PLAN_GROUP_LABEL, brl, type ClassPlan, type Enrollment, type PlanKind } from './billing.model';
import { fetchEnrollments, fetchPlans } from './billing-repository';
import type { ClassTeacher } from './class.model';
import { fetchTeachers } from './classes-repository';
import { planActivity, planCardView, plansStats, type PlanCardView } from './plan-card.model';

/** 13 · Planos de aula — no padrão dos Planos de horário: números do mês no topo e um card por plano
 *  (nome, regra, selo No app / Só recepção / Arquivado, preço, ciclos e cobrança, alunos e receita).
 *  O card abre o editor em página própria (`/painel/aulas/planos/:planId`). */
@Component({
  selector: 'ar-panel-aulas-plans',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AulasPageComponent, PillComponent, IconComponent, RouterLink],
  styleUrl: './aulas-form.scss',
  template: `
    <ar-aulas-page title="Aulas" subtitle="Mensalidades, pacotes de créditos e aulas avulsas" tab="planos" [empty]="!loading() && plans().length === 0">
      <a page-actions class="ar-mini-btn ar-mini-btn-primary" data-testid="aula-plan-new" [class.disabled]="readOnly()" [routerLink]="readOnly() ? null : '/painel/aulas/planos/novo'">
        <ar-icon name="plus" [size]="14" /> Novo plano
      </a>

      @if (loading()) {
        <p class="state-text">Carregando planos…</p>
      } @else if (loadError(); as err) {
        <p class="state-text">{{ err }}</p>
      } @else {
        <div class="stats">
          <div class="stat"><span class="k">Planos à venda</span><b>{{ stats().onSale }}</b><small>{{ stats().inApp }} no app · {{ stats().onSale - stats().inApp }} só na recepção</small></div>
          <div class="stat"><span class="k">Alunos ativos</span><b>{{ stats().students }}</b><small>em {{ stats().plansWithStudents }} plano{{ stats().plansWithStudents === 1 ? '' : 's' }}</small></div>
          <div class="stat"><span class="k">Receita recorrente</span><b>{{ brl(stats().monthlyReais) }}</b><small>por mês, mensais ativos</small></div>
          <div class="stat"><span class="k">Com ciclos longos</span><b>{{ stats().withCycles }}</b><small>trimestral, semestral ou anual</small></div>
        </div>

        @for (g of groups; track g) {
          @if (cardsOf(g).length > 0) {
            <section class="group">
              <div class="kicker">{{ groupLabel[g] }}</div>
              <div class="cards">
                @for (c of cardsOf(g); track c.plan.id) {
                  <a class="plan" [class.archived]="c.plan.status === 'archived'" [routerLink]="['/painel/aulas/planos', c.plan.id]" [attr.data-testid]="'aula-plan-card-' + c.plan.id">
                    <div class="plan-head">
                      <div class="plan-titles">
                        <div class="plan-name">{{ c.plan.name }}</div>
                        <div class="plan-sub">{{ c.sub }}</div>
                      </div>
                      <ar-pill [tone]="c.pill.tone">{{ c.pill.label }}</ar-pill>
                    </div>
                    <div class="price-row">
                      <span class="price">{{ c.price }}</span>
                      <span class="per">{{ c.unit }}</span>
                      @if (c.offer) {
                        <span class="off">{{ c.offer }}</span>
                      }
                    </div>
                    <div class="chip-row">
                      @for (t of c.chips; track $index) {
                        <span class="sm-chip" [title]="t">{{ t }}</span>
                      }
                    </div>
                    <div class="plan-foot">
                      <span><b>{{ c.students }}</b> aluno{{ c.students === 1 ? '' : 's' }} ativo{{ c.students === 1 ? '' : 's' }}</span>
                      <span class="mono">{{ c.revenue }}</span>
                    </div>
                  </a>
                }
              </div>
            </section>
          }
        }
        @if (plans().length === 0) {
          <div class="plan empty">
            <div class="plan-name">Nenhum plano ainda</div>
            <p class="hint">Crie o primeiro plano: mensalidade com aulas por semana (e ciclos com desconto), pacote de créditos ou aula avulsa.</p>
          </div>
        }
      }
    </ar-aulas-page>
  `,
  styles: `
    .state-text { font-size: 13.5px; color: var(--nx-text-mute); margin: 0; }
    .stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 20px; }
    .stat { padding: 16px 18px; border-radius: var(--nx-r-4); background: var(--nx-surface-0); border: 1px solid var(--nx-line); display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    .stat b { font-family: var(--nx-font-display); font-size: 24px; color: var(--nx-text); }
    .stat small { font-size: 12px; color: var(--nx-text-mute); }
    .k, .kicker { font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; color: var(--nx-text-dim); }
    .group { margin-bottom: 20px; }
    .kicker { margin-bottom: 10px; }
    .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }
    .plan { padding: 16px; border-radius: var(--nx-r-4); background: var(--nx-surface-0); border: 1px solid var(--nx-line); display: flex; flex-direction: column; gap: 12px; text-decoration: none; color: inherit; min-width: 0; }
    a.plan:hover { border-color: rgba(255, 106, 26, 0.45); }
    .plan.archived { opacity: 0.55; border-style: dashed; }
    .plan.empty { max-width: 420px; }
    .plan-head { display: flex; align-items: flex-start; gap: 10px; }
    .plan-titles { flex: 1; min-width: 0; }
    .plan-name { font-family: var(--nx-font-display); font-weight: 700; font-size: 15.5px; color: var(--nx-text); overflow-wrap: anywhere; }
    .plan-sub { font-family: var(--nx-font-mono); font-size: 10.5px; color: var(--nx-text-dim); margin-top: 4px; text-transform: uppercase; }
    .price-row { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
    .price { font-family: var(--nx-font-mono); font-weight: 800; font-size: 24px; letter-spacing: -0.02em; color: var(--nx-text); }
    .per { font-size: 12px; color: var(--nx-text-dim); }
    .off { font-family: var(--nx-font-mono); font-size: 10.5px; font-weight: 700; color: var(--nx-win); }
    .sm-chip { display: inline-block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; height: 24px; line-height: 22px; padding: 0 10px; border-radius: 99px; font-family: var(--nx-font-display); font-weight: 600; font-size: 11.5px; background: var(--nx-surface-1); border: 1px solid var(--nx-line); color: var(--nx-text-mute); white-space: nowrap; box-sizing: border-box; }
    .plan-foot { margin-top: auto; padding-top: 10px; border-top: 1px solid var(--nx-line); display: flex; justify-content: space-between; gap: 8px; font-size: 11.5px; color: var(--nx-text-mute); }
    .plan-foot b, .mono { font-family: var(--nx-font-mono); color: var(--nx-text); font-weight: 700; }
    .hint { font-size: 12px; color: var(--nx-text-dim); margin: 0; }
    @media (max-width: 1180px) { .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 640px) { .stats { grid-template-columns: minmax(0, 1fr); } }
  `,
})
export class PanelAulasPlansComponent {
  private readonly arenaContext = inject(ArenaContextService);
  private readonly access = inject(ArenaAccessService);

  protected readonly groups: readonly PlanKind[] = ['monthly', 'package', 'single'];
  protected readonly groupLabel = PLAN_GROUP_LABEL;
  protected readonly brl = brl;
  protected readonly readOnly = computed(() => !this.access.canWrite('agenda') || !this.arenaContext.hasCapability('aulas'));

  protected readonly plans = signal<ClassPlan[]>([]);
  private readonly enrollments = signal<Enrollment[]>([]);
  private readonly teachers = signal<ClassTeacher[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);

  protected readonly stats = computed(() => plansStats(this.plans(), this.enrollments()));
  private readonly cards = computed<PlanCardView[]>(() => {
    const activity = planActivity(this.enrollments());
    const live = new Set(this.teachers().filter((t) => t.status === 'active').map((t) => t.id));
    return [...this.plans()]
      // Arquivados no fim de cada grupo.
      .sort((a, b) => Number(a.status === 'archived') - Number(b.status === 'archived') || a.priceReais - b.priceReais)
      .map((p) => planCardView(p, activity.get(p.id), p.teacherIds.filter((id) => live.has(id)).length));
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
      const [plans, enrollments, teachers] = await Promise.all([
        fetchPlans(db, arenaId),
        fetchEnrollments(db, arenaId),
        fetchTeachers(db, arenaId).catch(() => [] as ClassTeacher[]),
      ]);
      this.plans.set(plans);
      this.enrollments.set(enrollments);
      this.teachers.set(teachers);
    } catch {
      this.loadError.set('Não foi possível carregar os planos.');
    } finally {
      this.loading.set(false);
    }
  }

  protected cardsOf(kind: PlanKind): PlanCardView[] {
    return this.cards().filter((c) => c.plan.kind === kind);
  }
}
