import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ArenaAccessService } from '../data/arena-access.service';
import { ArenaContextService } from '../data/arena-context.service';
import { arenaFirestore } from '../data/firestore';
import { arenaFunctions } from '../data/functions';
import { IconComponent } from '../ui/icon.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { ToggleComponent } from '../ui/toggle.component';
import { AulasPageComponent } from './aulas-ui';
import {
  ATHLETE_DUE_DAY_CHOICES,
  CLASS_PAYMENT_FORMS,
  CLASS_PAYMENT_FORM_LABEL,
  CYCLE_LABEL,
  DEFAULT_PLAN_BILLING,
  DEFAULT_PLAN_CYCLES,
  DEFAULT_RULES,
  MAX_CYCLE_DISCOUNT_PERCENT,
  PLAN_CYCLES,
  PLAN_KIND_LABEL,
  brl,
  cycleMonthlyPrice,
  parsePrice,
  planCycles,
  planPriceUnit,
  type ClassPaymentForm,
  type ClassPlan,
  type ClassRules,
  type LongCycle,
  type PlanBilling,
  type PlanCycle,
  type PlanCycles,
  type PlanKind,
} from './billing.model';
import { fetchEnrollments, fetchPlans, fetchRules, upsertPlan } from './billing-repository';
import type { ClassTeacher } from './class.model';
import { fetchTeachers } from './classes-repository';
import { planActivity } from './plan-card.model';

interface PlanDraft {
  name: string;
  kind: PlanKind;
  price: string;
  classesPerWeek: number;
  makeupsPerMonth: number;
  credits: number;
  validityDays: number;
  description: string;
  status: 'active' | 'archived';
  teacherIds: string[];
  availableInApp: boolean;
  /** Ciclos do plano mensal (desconto sobre o mensal). */
  cycles: PlanCycles;
  /** Formas aceitas e vencimento (só plano mensal). */
  billing: PlanBilling;
}

function cloneCycles(c: PlanCycles): PlanCycles {
  return { monthly: { ...c.monthly }, quarterly: { ...c.quarterly }, semiannual: { ...c.semiannual }, annual: { ...c.annual } };
}

function cloneBilling(b: PlanBilling): PlanBilling {
  return { methods: [...b.methods], dueDay: b.dueDay, dueDayOptions: [...b.dueDayOptions] };
}

function emptyDraft(): PlanDraft {
  return {
    name: '', kind: 'monthly', price: '', classesPerWeek: 2, makeupsPerMonth: 2, credits: 8, validityDays: 60,
    description: '', status: 'active', teacherIds: [], availableInApp: false,
    cycles: cloneCycles(DEFAULT_PLAN_CYCLES), billing: cloneBilling(DEFAULT_PLAN_BILLING),
  };
}

function draftOf(p: ClassPlan): PlanDraft {
  return {
    name: p.name, kind: p.kind, price: String(p.priceReais).replace('.', ','),
    classesPerWeek: p.classesPerWeek ?? 2, makeupsPerMonth: p.makeupsPerMonth ?? 0,
    credits: p.credits ?? 8, validityDays: p.validityDays ?? 60, description: p.description ?? '', status: p.status,
    teacherIds: [...p.teacherIds], availableInApp: p.availableInApp,
    cycles: cloneCycles(p.cycles), billing: cloneBilling(p.billing),
  };
}

/** Vencimento fixo — os dias do Plano de horário; `null` = o das Regras de aulas. */
const DUE_DAYS: readonly number[] = [1, 5, 10, 15];

/** Ciclos com desconto, na linguagem do editor dos Planos de horário. */
const DISCOUNT_CYCLES: ReadonlyArray<{ id: LongCycle; label: string; sub: string }> = [
  { id: 'quarterly', label: 'Trimestral', sub: '3 meses · paga mês a mês' },
  { id: 'semiannual', label: 'Semestral', sub: '6 meses · paga mês a mês' },
  { id: 'annual', label: 'Anual', sub: '12 meses · à vista (1ª proporcional)' },
];

function discountOk(n: number): boolean {
  return Number.isInteger(n) && n >= 0 && n <= MAX_CYCLE_DISCOUNT_PERCENT;
}

/** Editar plano de aula em página própria (`/painel/aulas/planos/novo` e `/:planId`) — mesmo desenho
 *  do editor dos Planos de horário: Plano · Professores e app · Preço e ciclo · Cobrança, e ao lado
 *  como o aluno vê. Mudar o valor vale para matrículas novas. */
@Component({
  selector: 'ar-panel-aula-plan-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AulasPageComponent, PanelCardComponent, IconComponent, ToggleComponent, RouterLink],
  styleUrl: './aulas-form.scss',
  template: `
    <ar-aulas-page [title]="title()" [subtitle]="planId ? 'Aulas · Planos · Editar plano' : 'Aulas · Planos · Novo plano'">
      <div page-actions class="actions">
        @if (planId) {
          <span class="head-hint">Mudar o valor vale para matrículas novas</span>
        }
        <a class="ar-ghost-btn" routerLink="/painel/aulas/planos">Descartar</a>
        @if (planId && original()) {
          <button type="button" class="ar-mini-btn" [disabled]="saving() || readOnly()" (click)="toggleArchive()">{{ d().status === 'archived' ? 'Reativar' : 'Arquivar' }}</button>
        }
        <button type="button" class="ar-mini-btn ar-mini-btn-primary" data-testid="aula-plan-save" [disabled]="saving() || readOnly() || !canSave()" (click)="save()">
          <ar-icon name="check" [size]="14" /> {{ saving() ? 'Salvando…' : planId ? 'Salvar plano' : 'Criar plano' }}
        </button>
      </div>

      @if (loading()) {
        <p class="state-text">Carregando plano…</p>
      } @else if (loadError(); as err) {
        <p class="state-text">{{ err }}</p>
      } @else if (planId && !original()) {
        <p class="state-text">Plano não encontrado. <a class="cta" routerLink="/painel/aulas/planos">Voltar aos planos</a></p>
      } @else {
        @if (saveError(); as err) {
          <div class="error-banner">{{ err }}</div>
        }
        <div class="layout">
          <div class="col">
            <ar-panel-card title="Plano" kicker="O que o aluno contrata">
              <div class="field-label">Nome do plano</div>
              <input class="input-box" type="text" maxlength="60" placeholder="Ex.: Vôlei 2x" [value]="d().name" (input)="patch({ name: $any($event.target).value })" />
              <div class="field-label spaced">Tipo</div>
              <div class="chip-row">
                @for (k of kinds; track k) {
                  <button type="button" class="ar-chip" [class.active]="d().kind === k" [disabled]="planId != null" (click)="patch({ kind: k })">{{ kindLabel[k] }}</button>
                }
              </div>
              @if (planId) {
                <p class="hint">O tipo não muda depois de criado.</p>
              }
              @if (d().kind === 'monthly') {
                <div class="row-2">
                  <div>
                    <div class="field-label spaced">Aulas por semana</div>
                    <div class="stepper">
                      <span>{{ d().classesPerWeek }}x</span>
                      <button type="button" aria-label="Menos aulas por semana" (click)="patch({ classesPerWeek: Math.max(1, d().classesPerWeek - 1) })">–</button>
                      <button type="button" aria-label="Mais aulas por semana" (click)="patch({ classesPerWeek: Math.min(7, d().classesPerWeek + 1) })">+</button>
                    </div>
                  </div>
                  <div>
                    <div class="field-label spaced">Reposições por mês</div>
                    <div class="stepper">
                      <span>{{ d().makeupsPerMonth }}</span>
                      <button type="button" aria-label="Menos reposições" (click)="patch({ makeupsPerMonth: Math.max(0, d().makeupsPerMonth - 1) })">–</button>
                      <button type="button" aria-label="Mais reposições" (click)="patch({ makeupsPerMonth: Math.min(10, d().makeupsPerMonth + 1) })">+</button>
                    </div>
                  </div>
                </div>
                <p class="hint">Faltas justificadas viram crédito até esse limite no mês.</p>
              } @else {
                <div class="field-label spaced">Valor (R$){{ unit(d().kind) }}</div>
                <input class="input-box" type="text" inputmode="decimal" placeholder="450,00" [value]="d().price" (input)="patch({ price: $any($event.target).value })" />
                @if (d().kind === 'package') {
                  <div class="row-2">
                    <div>
                      <div class="field-label spaced">Créditos (aulas)</div>
                      <input class="input-box" type="number" min="1" max="100" [value]="d().credits" (input)="patch({ credits: +$any($event.target).value })" />
                    </div>
                    <div>
                      <div class="field-label spaced">Validade (dias)</div>
                      <input class="input-box" type="number" min="1" max="365" [value]="d().validityDays" (input)="patch({ validityDays: +$any($event.target).value })" />
                    </div>
                  </div>
                  <p class="hint">Cada aula com presença (ou falta sem aviso) consome 1 crédito.</p>
                } @else {
                  <p class="hint">Plano avulso fica no catálogo; a matrícula usa mensalidades e pacotes.</p>
                }
              }
              <div class="field-label spaced">Descrição (opcional)</div>
              <input class="input-box" type="text" maxlength="120" placeholder="Ex.: Turmas de até 8 · iniciante e intermediário" [value]="d().description" (input)="patch({ description: $any($event.target).value })" />
            </ar-panel-card>

            @if (d().kind !== 'single') {
              <ar-panel-card title="Professores e app" kicker="Quem dá aula · onde vende">
                <p class="hint first">O aluno escolhe entre eles ao contratar e vê só os horários das turmas de quem escolheu. Nenhum marcado = qualquer turma da arena.</p>
                <div class="teachers">
                  @for (t of activeTeachers(); track t.id) {
                    <button type="button" class="teacher" [class.on]="d().teacherIds.includes(t.id)" [attr.aria-pressed]="d().teacherIds.includes(t.id)" (click)="toggleTeacher(t.id)">
                      <span class="dot" [style.background]="t.color"></span>
                      <span>{{ t.name }}</span>
                      @if (d().teacherIds.includes(t.id)) {
                        <ar-icon name="check" [size]="13" />
                      }
                    </button>
                  } @empty {
                    <p class="hint first">Cadastre professores na aba Professores.</p>
                  }
                </div>
                <div class="app-toggle">
                  <ar-toggle label="Contratar pelo app" [checked]="d().availableInApp" (changed)="patch({ availableInApp: $event })" />
                  <p class="hint first">Aparece no perfil da arena: o aluno escolhe professor, dias e ciclo e assina o contrato (aba Contratos). Desligado, só a recepção matricula.</p>
                </div>
              </ar-panel-card>
            }
          </div>

          <div class="col">
            @if (d().kind === 'monthly') {
              <ar-panel-card title="Preço e ciclo" kicker="Mensalidade">
                <div class="field-label">Mensal (R$)</div>
                <input class="input-box" type="text" inputmode="decimal" placeholder="260,00" [value]="d().price" (input)="patch({ price: $any($event.target).value })" />
                <div class="cycle spaced-top">
                  <div><div class="cycle-name" [class.off]="!d().cycles.monthly.enabled">Mensal</div><div class="cycle-sub">Sem fidelidade</div></div>
                  <span class="cycle-val">{{ brl(priceValue()) }}<small>/mês</small></span>
                  <ar-toggle [checked]="d().cycles.monthly.enabled" label="Mensal" (changed)="setCycle('monthly', $event)" />
                </div>
                @for (c of discountCycles; track c.id) {
                  <div class="cycle">
                    <div>
                      <div class="cycle-name" [class.off]="!d().cycles[c.id].enabled">
                        {{ c.label }}
                        <span class="disc">−<input type="number" min="0" [max]="maxDiscount" [attr.aria-label]="'Desconto ' + c.label" [value]="d().cycles[c.id].discountPercent" (input)="setDiscount(c.id, +$any($event.target).value)" />%</span>
                      </div>
                      <div class="cycle-sub">{{ c.sub }}</div>
                    </div>
                    @if (c.id === 'annual') {
                      <span class="cycle-val">{{ brl(cycleValue(d().cycles[c.id].discountPercent) * 12) }}<small>/ano</small></span>
                    } @else {
                      <span class="cycle-val">{{ brl(cycleValue(d().cycles[c.id].discountPercent)) }}<small>/mês</small></span>
                    }
                    <ar-toggle [checked]="d().cycles[c.id].enabled" [label]="c.label" (changed)="setCycle(c.id, $event)" />
                  </div>
                }
                @if (cycleError(); as err) {
                  <p class="hint warn">{{ err }}</p>
                } @else {
                  <p class="hint">Trimestral e semestral têm fidelidade e são cobrados mês a mês com desconto; o anual é cobrado de uma vez.</p>
                }
              </ar-panel-card>

              <ar-panel-card title="Cobrança" kicker="Recorrente">
                <div class="field-label">Formas</div>
                <div class="chip-row">
                  @for (f of forms; track f) {
                    <button type="button" class="ar-chip" [class.active]="d().billing.methods.includes(f)" [attr.aria-pressed]="d().billing.methods.includes(f)" (click)="toggleForm(f)">{{ formLabel[f] }}</button>
                  }
                </div>
                @if (d().billing.methods.length === 0) {
                  <p class="hint warn">Escolha ao menos uma forma de pagamento.</p>
                } @else if (!rules().onlineBillingEnabled && (d().billing.methods.includes('pix') || d().billing.methods.includes('card'))) {
                  <p class="hint">Para cobrar pelo app, ligue a cobrança online nas Regras de aulas.</p>
                } @else {
                  <p class="hint">Pix e cartão saem por link e são pagos pelo app; na arena, baixa manual.</p>
                }
                <div class="field-label spaced">Vencimento</div>
                <div class="chip-row">
                  <button type="button" class="ar-chip" [class.active]="d().billing.dueDayOptions.length === 0 && d().billing.dueDay == null"
                    (click)="setDueDay(null)">Das Regras (dia {{ rules().defaultDueDay }})</button>
                  @for (n of dueDays; track n) {
                    <button type="button" class="ar-chip" [class.active]="d().billing.dueDayOptions.length === 0 && d().billing.dueDay === n"
                      (click)="setDueDay(n)">Dia {{ n }}</button>
                  }
                  <button type="button" class="ar-chip" [class.active]="d().billing.dueDayOptions.length > 0"
                    (click)="letAthleteChooseDueDay()">Atleta escolhe: {{ athleteDueDaysLabel }}</button>
                </div>
                @if (d().billing.dueDayOptions.length > 0) {
                  <p class="hint">Ao contratar, o atleta escolhe o dia {{ athleteDueDaysLabel }}. As mensalidades vencem sempre nesse dia.</p>
                }
              </ar-panel-card>
            }
          </div>

          <div class="col">
            <ar-panel-card title="Como o aluno vê" kicker="App">
              <div class="preview">
                <div class="pv-head">
                  <div>
                    <div class="pv-name">{{ d().name || 'Nome do plano' }}</div>
                    <div class="pv-sub">{{ previewSub() }}</div>
                  </div>
                  <span class="pv-price">{{ priceValue() > 0 ? brl(priceValue()) : '—' }}</span>
                </div>
                @if (previewCycles().length > 0) {
                  <div class="chip-row">
                    @for (c of previewCycles(); track c) {
                      <span class="sm-chip">{{ c }}</span>
                    }
                  </div>
                }
                <div class="pv-sub">{{ teachersLine() }}</div>
              </div>
              @if (!d().availableInApp || d().kind === 'single') {
                <p class="hint">Fora do app: só a recepção matricula neste plano.</p>
              }
              @if (planId) {
                <div class="kv"><span>Alunos ativos</span><b>{{ activity().students }}</b></div>
                @if (d().kind === 'monthly') {
                  <div class="kv"><span>Receita do plano</span><b>{{ brl(activity().monthlyReais) }}/mês</b></div>
                }
              }
              <div class="kv"><span>Contrato do aluno</span><a class="cta" routerLink="/painel/aulas/contratos">Ver modelo</a></div>
            </ar-panel-card>
          </div>
        </div>
      }
    </ar-aulas-page>
  `,
  styles: `
    .state-text { font-size: 13.5px; color: var(--nx-text-mute); margin: 0; }
    .actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .head-hint { font-size: 12px; color: var(--nx-text-dim); margin-right: 6px; }
    .layout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 320px; gap: 16px; align-items: start; }
    .col { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
    .first { margin-top: 0; }
    .spaced-top { margin-top: 8px; }
    .cycle { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; gap: 12px; padding: 11px 0; border-bottom: 1px solid var(--nx-line); }
    .cycle-name { font-family: var(--nx-font-display); font-weight: 700; font-size: 13px; color: var(--nx-text); }
    .cycle-name.off { color: var(--nx-text-mute); }
    .cycle-sub { font-size: 11px; color: var(--nx-text-dim); margin-top: 2px; }
    .disc { font-family: var(--nx-font-mono); font-size: 10px; font-weight: 700; color: var(--nx-win); margin-left: 8px; }
    .disc input { width: 34px; background: transparent; border: none; border-bottom: 1px dashed rgba(43, 209, 126, 0.5); color: inherit; font: inherit; text-align: right; padding: 0; }
    .cycle-val { font-family: var(--nx-font-mono); font-weight: 700; font-size: 13px; color: var(--nx-text); white-space: nowrap; }
    .cycle-val small { font-weight: 500; font-size: 10.5px; color: var(--nx-text-dim); }
    .hint.warn { color: var(--nx-live); }
    .teachers { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
    .teacher { display: inline-flex; align-items: center; gap: 7px; min-height: 36px; padding: 0 12px; border-radius: 999px; border: 1px solid var(--nx-line); background: var(--nx-surface-0); color: var(--nx-text-mute); font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer; }
    .teacher.on { border-color: var(--nx-orange-500); color: var(--nx-text); background: rgba(255, 106, 26, 0.08); }
    .teacher .dot { width: 8px; height: 8px; border-radius: 50%; }
    .app-toggle { margin-top: 14px; padding: 12px 14px; border-radius: var(--nx-r-3, 12px); border: 1px solid var(--nx-line); background: var(--nx-surface-0); }
    .preview { padding: 14px; border-radius: var(--nx-r-4); background: var(--nx-surface-1); border: 1px solid var(--nx-line); display: flex; flex-direction: column; gap: 10px; }
    .pv-head { display: flex; justify-content: space-between; gap: 10px; }
    .pv-name { font-family: var(--nx-font-display); font-weight: 700; font-size: 14.5px; color: var(--nx-text); }
    .pv-sub { font-size: 12px; color: var(--nx-text-mute); margin-top: 2px; }
    .pv-price { font-family: var(--nx-font-mono); font-weight: 700; font-size: 15px; color: var(--nx-orange-500); white-space: nowrap; }
    .kv { display: flex; justify-content: space-between; gap: 12px; padding: 9px 0; border-bottom: 1px solid var(--nx-line); font-size: 13px; color: var(--nx-text-mute); }
    .kv b { color: var(--nx-text); font-family: var(--nx-font-mono); }
    .cta { color: var(--nx-orange-500); font-weight: 600; text-decoration: none; }
    .sm-chip { display: inline-flex; align-items: center; height: 24px; padding: 0 10px; border-radius: 99px; font-family: var(--nx-font-display); font-weight: 600; font-size: 11.5px; background: var(--nx-surface-0); border: 1px solid var(--nx-line); color: var(--nx-text-mute); white-space: nowrap; }
    @media (max-width: 1280px) { .layout { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } }
    @media (max-width: 900px) { .layout { grid-template-columns: minmax(0, 1fr); } }
  `,
})
export class PanelAulaPlanEditorComponent {
  private readonly arenaContext = inject(ArenaContextService);
  private readonly access = inject(ArenaAccessService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly planId: string | null = this.route.snapshot.paramMap.get('planId');
  protected readonly Math = Math;
  protected readonly kinds: readonly PlanKind[] = ['monthly', 'package', 'single'];
  protected readonly kindLabel = PLAN_KIND_LABEL;
  protected readonly brl = brl;
  protected readonly unit = planPriceUnit;
  protected readonly discountCycles = DISCOUNT_CYCLES;
  protected readonly maxDiscount = MAX_CYCLE_DISCOUNT_PERCENT;
  protected readonly forms = CLASS_PAYMENT_FORMS;
  protected readonly formLabel = CLASS_PAYMENT_FORM_LABEL;
  protected readonly dueDays = DUE_DAYS;
  protected readonly athleteDueDaysLabel = `${ATHLETE_DUE_DAY_CHOICES.slice(0, -1).join(', ')} ou ${ATHLETE_DUE_DAY_CHOICES.at(-1)}`;
  protected readonly readOnly = computed(() => !this.access.canWrite('agenda') || !this.arenaContext.hasCapability('aulas'));

  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly original = signal<ClassPlan | null>(null);
  protected readonly d = signal<PlanDraft>(emptyDraft());
  protected readonly rules = signal<ClassRules>(DEFAULT_RULES);
  private readonly teachers = signal<ClassTeacher[]>([]);
  protected readonly activeTeachers = computed(() => this.teachers().filter((t) => t.status === 'active'));
  protected readonly activity = signal<{ students: number; monthlyReais: number }>({ students: 0, monthlyReais: 0 });
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);

  protected readonly title = computed(() => this.d().name.trim() || (this.planId ? 'Plano' : 'Novo plano'));
  /** Mensal digitado (0 enquanto vazio ou inválido) — base dos valores de cada ciclo. */
  protected readonly priceValue = computed(() => {
    const v = parsePrice(this.d().price);
    return Number.isFinite(v) && v > 0 ? v : 0;
  });
  protected readonly cycleError = computed(() => {
    const d = this.d();
    if (d.kind !== 'monthly') return null;
    if (!PLAN_CYCLES.some((c) => d.cycles[c].enabled)) return 'Ligue ao menos um ciclo.';
    if (!PLAN_CYCLES.every((c) => discountOk(d.cycles[c].discountPercent))) return `Desconto de 0% a ${MAX_CYCLE_DISCOUNT_PERCENT}%.`;
    return null;
  });
  protected readonly canSave = computed(() => {
    const d = this.d();
    if (d.name.trim().length < 2) return false;
    const price = parsePrice(d.price);
    const monthlyOk = d.kind !== 'monthly' || (this.cycleError() == null && d.billing.methods.length > 0);
    return monthlyOk && Number.isFinite(price) && (d.kind === 'single' ? price >= 0 : price > 0);
  });
  protected readonly previewSub = computed(() => {
    const d = this.d();
    if (d.kind === 'monthly') return `${d.classesPerWeek} aula${d.classesPerWeek === 1 ? '' : 's'} por semana`;
    if (d.kind === 'package') return `Pacote de ${d.credits} aulas · ${d.validityDays} dias`;
    return 'Aula avulsa';
  });
  protected readonly previewCycles = computed(() => {
    const d = this.d();
    if (d.kind !== 'monthly') return [];
    return planCycles({ kind: 'monthly', priceReais: this.priceValue(), cycles: d.cycles })
      .map((c) => (c.discountPercent > 0 ? `${CYCLE_LABEL[c.cycle]} −${c.discountPercent}%` : CYCLE_LABEL[c.cycle]));
  });
  protected readonly teachersLine = computed(() => {
    const ids = this.d().teacherIds;
    if (this.d().kind === 'single') return '';
    if (ids.length === 0) return 'Qualquer professor da arena';
    const names = this.activeTeachers().filter((t) => ids.includes(t.id)).map((t) => t.name);
    return names.length === 1 ? names[0]! : `${names.length} professores`;
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
      const [plans, enrollments, teachers, rules] = await Promise.all([
        fetchPlans(db, arenaId),
        this.planId ? fetchEnrollments(db, arenaId).catch(() => []) : Promise.resolve([]),
        fetchTeachers(db, arenaId).catch(() => [] as ClassTeacher[]),
        fetchRules(db, arenaId).catch(() => DEFAULT_RULES),
      ]);
      this.teachers.set(teachers);
      this.rules.set(rules);
      if (this.planId) {
        const plan = plans.find((p) => p.id === this.planId) ?? null;
        this.original.set(plan);
        if (plan) this.d.set(draftOf(plan));
        this.activity.set(planActivity(enrollments).get(this.planId) ?? { students: 0, monthlyReais: 0 });
      }
    } catch {
      this.loadError.set('Não foi possível carregar o plano.');
    } finally {
      this.loading.set(false);
    }
  }

  protected patch(change: Partial<PlanDraft>): void {
    this.d.set({ ...this.d(), ...change });
  }

  protected setCycle(id: PlanCycle, enabled: boolean): void {
    const d = this.d();
    this.d.set({ ...d, cycles: { ...d.cycles, [id]: { ...d.cycles[id], enabled } } });
  }

  protected setDiscount(id: LongCycle, discountPercent: number): void {
    const d = this.d();
    this.d.set({ ...d, cycles: { ...d.cycles, [id]: { ...d.cycles[id], discountPercent: Number.isFinite(discountPercent) ? discountPercent : 0 } } });
  }

  protected cycleValue(discountPercent: number): number {
    return cycleMonthlyPrice(this.priceValue(), discountOk(discountPercent) ? discountPercent : 0);
  }

  protected toggleForm(f: ClassPaymentForm): void {
    const d = this.d();
    const methods = d.billing.methods.includes(f)
      ? d.billing.methods.filter((m) => m !== f)
      : CLASS_PAYMENT_FORMS.filter((m) => m === f || d.billing.methods.includes(m));
    this.d.set({ ...d, billing: { ...d.billing, methods } });
  }

  /** Vencimento fixo (`null` = o das Regras de aulas). */
  protected setDueDay(dueDay: number | null): void {
    const d = this.d();
    this.d.set({ ...d, billing: { ...d.billing, dueDay, dueDayOptions: [] } });
  }

  /** Vencimento à escolha do atleta (5, 15 ou 25); quem não escolhe fica com o 1º. */
  protected letAthleteChooseDueDay(): void {
    const d = this.d();
    this.d.set({ ...d, billing: { ...d.billing, dueDay: ATHLETE_DUE_DAY_CHOICES[0] ?? 5, dueDayOptions: [...ATHLETE_DUE_DAY_CHOICES] } });
  }

  protected toggleTeacher(teacherId: string): void {
    const d = this.d();
    const teacherIds = d.teacherIds.includes(teacherId)
      ? d.teacherIds.filter((id) => id !== teacherId)
      : [...d.teacherIds, teacherId];
    this.d.set({ ...d, teacherIds });
  }

  protected save(): Promise<void> {
    return this.persist(this.d().status);
  }

  protected toggleArchive(): Promise<void> {
    return this.persist(this.d().status === 'archived' ? 'active' : 'archived');
  }

  private async persist(status: 'active' | 'archived'): Promise<void> {
    const d = this.d();
    const arenaId = this.arenaContext.arenaId();
    if (!arenaId || this.readOnly() || (status === d.status && !this.canSave())) return;
    this.saving.set(true);
    this.saveError.set(null);
    try {
      await upsertPlan(arenaFunctions(), {
        arenaId,
        planId: this.planId ?? undefined,
        name: d.name.trim(),
        kind: d.kind,
        priceReais: parsePrice(d.price),
        classesPerWeek: d.kind === 'monthly' ? d.classesPerWeek : null,
        makeupsPerMonth: d.kind === 'monthly' ? d.makeupsPerMonth : null,
        credits: d.kind === 'package' ? d.credits : null,
        validityDays: d.kind === 'package' ? d.validityDays : null,
        description: d.description.trim() || null,
        status,
        teacherIds: d.kind === 'single' ? [] : d.teacherIds,
        cycles: d.kind === 'monthly' ? d.cycles : cloneCycles(DEFAULT_PLAN_CYCLES),
        ...(d.kind === 'monthly' ? { billing: d.billing } : {}),
        availableInApp: d.kind !== 'single' && d.availableInApp,
      });
      void this.router.navigate(['/painel/aulas/planos']);
    } catch (err) {
      this.saveError.set(err instanceof Error ? err.message : 'Não foi possível salvar o plano.');
    } finally {
      this.saving.set(false);
    }
  }
}
