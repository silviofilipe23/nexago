import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ArenaAccessService } from '../data/arena-access.service';
import { ArenaContextService } from '../data/arena-context.service';
import { arenaFirestore } from '../data/firestore';
import { arenaFunctions } from '../data/functions';
import { IconComponent } from '../ui/icon.component';
import { ModalComponent } from '../ui/modal.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PillComponent } from '../ui/pill.component';
import type { AthleteSearchResult } from '../clubinho/clubs-repository';
import { AulaAthletePickerComponent } from './aula-modals.component';
import { AulaStatComponent, AulasPageComponent, OccupancyBarComponent, TeacherAvatarComponent } from './aulas-ui';
import { brl } from './billing.model';
import { TEACHER_COLORS, teacherStats, todayKeyLocal, type ArenaClass, type ClassTeacher } from './class.model';
import { fetchClasses, fetchTeachers, upsertTeacher } from './classes-repository';
import { previewPayouts } from './payout-repository';
import {
  DEFAULT_PAYOUT_MODEL,
  PAYOUT_MODELS,
  PAYOUT_MODEL_LABEL,
  monthLastDay,
  monthShortLabel,
  payoutDraftValue,
  payoutModelFromDraft,
  payoutModelLabel,
  shortMonthDay,
  type ArenaPayoutPreview,
  type PayoutModelKind,
} from './payout.model';

interface TeacherDraft {
  teacherId: string | null;
  /** Conta já vinculada (edição). */
  userId: string | null;
  name: string;
  /** Atleta escolhido na busca (cadastro novo ou vínculo de professor antigo). */
  picked: AthleteSearchResult | null;
  specialty: string;
  phone: string;
  color: string;
  payoutModel: PayoutModelKind;
  payoutValue: string;
}

/** 14 · Professores — todo professor é uma conta NexaGO (quase sempre atleta da própria
 *  arena): escolhido pela busca de atleta; nome e foto vêm do perfil. Aulas/semana, alunos e
 *  ocupação saem das turmas ativas. Repasse (modelo e "a pagar" do mês) só para quem lê o
 *  financeiro; o modelo só o gestor muda. */
@Component({
  selector: 'ar-panel-aulas-teachers',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AulasPageComponent,
    PanelCardComponent,
    AulaStatComponent,
    PillComponent,
    IconComponent,
    ModalComponent,
    TeacherAvatarComponent,
    OccupancyBarComponent,
    AulaAthletePickerComponent,
    RouterLink,
  ],
  styleUrl: './aulas-form.scss',
  template: `
    <ar-aulas-page title="Aulas" [subtitle]="canSeePayout() ? 'Professores da arena · agenda, alunos e repasse' : 'Professores da arena · agenda e alunos'" tab="professores" [empty]="!loading() && teachers().length === 0">
      <div page-actions class="head-actions">
        @if (canSeePayout()) {
          <a class="ar-mini-btn" routerLink="/painel/aulas/repasse">Repasse do mês</a>
        }
        <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="readOnly()" (click)="openNew()">
          <ar-icon name="plus" [size]="14" />
          Adicionar professor
        </button>
      </div>

      @if (loading()) {
        <p class="state-text">Carregando professores…</p>
      } @else if (loadError(); as err) {
        <p class="state-text">{{ err }}</p>
      } @else {
        <div class="kpis">
          <ar-aula-stat label="Professores ativos" [value]="'' + activeTeachers().length" />
          <ar-aula-stat label="Aulas na semana" [value]="'' + totals().classesPerWeek" sub="das turmas ativas" />
          @if (canSeePayout()) {
            <ar-aula-stat [label]="'Receita de aulas · ' + monthShort" [value]="payout() ? brl(payout()!.revenueReais) : '—'" tone="green" sub="mensalidades pagas no mês" />
            <ar-aula-stat [label]="'Repasse previsto · ' + monthShort" [value]="payout() ? brl(payoutTotal()) : '—'" tone="orange" [sub]="'Fechamento em ' + closingDay" />
          } @else {
            <ar-aula-stat label="Alunos nas turmas" [value]="'' + totals().students" />
            <ar-aula-stat label="Ocupação média" [value]="totals().pct + '%'" tone="orange" />
          }
        </div>

        <ar-panel-card title="Professores" [kicker]="teachers().length + ' cadastrados'">
          <div class="ar-table-scroll" tabindex="0" role="region" aria-label="Tabela de professores">
            <div class="ar-table-inner">
              <div class="table-head" [class.with-payout]="canSeePayout()">
                <span>Professor</span><span>Modalidade</span><span>Aulas/sem</span><span>Alunos</span><span>Ocupação</span>
                @if (canSeePayout()) {
                  <span>Repasse</span><span>A pagar · {{ monthShort }}</span>
                }
                <span>Status</span><span></span>
              </div>
              @for (t of teachers(); track t.id) {
                <div class="table-row" [class.with-payout]="canSeePayout()" [class.archived]="t.status === 'archived'">
                  <div class="who">
                    <ar-teacher-avatar [name]="t.name" [color]="t.color" [size]="36" />
                    <div>
                      <div class="name">{{ t.name }}</div>
                      @if (t.userId) {
                        <div class="sub ok">● Conta NexaGO{{ t.phone ? ' · ' + t.phone : '' }}</div>
                      } @else {
                        <button type="button" class="link-warn" [disabled]="readOnly()" (click)="openEdit(t)">Sem conta · vincular</button>
                      }
                    </div>
                  </div>
                  <span class="cell">{{ t.specialty || '—' }}</span>
                  <span class="mono">{{ stats().get(t.id)?.classesPerWeek ?? 0 }}</span>
                  <span class="mono">{{ stats().get(t.id)?.students ?? 0 }}</span>
                  <div class="occ">
                    <ar-occupancy-bar [pct]="stats().get(t.id)?.occupancyPct ?? 0" [color]="t.color" />
                    <span class="mono">{{ stats().get(t.id)?.occupancyPct ?? 0 }}%</span>
                  </div>
                  @if (canSeePayout()) {
                    @if (t.payout) {
                      <span class="cell">{{ modelLabel(t) }}</span>
                    } @else {
                      <button type="button" class="link-warn" [disabled]="!canManagePayout()" (click)="openEdit(t)">Definir repasse</button>
                    }
                    <a class="mono orange link" [routerLink]="['/painel/aulas/repasse', t.id]">{{ toPay(t.id) }}</a>
                  }
                  <div>
                    <ar-pill [tone]="t.status === 'active' ? 'green' : 'dim'">{{ t.status === 'active' ? 'Ativo' : 'Arquivado' }}</ar-pill>
                  </div>
                  <div class="actions">
                    <button type="button" class="ar-mini-btn" [disabled]="readOnly()" (click)="openEdit(t)">Editar</button>
                  </div>
                </div>
              } @empty {
                <p class="state-text empty">Nenhum professor ainda. Cadastre quem dá aula na arena para montar as turmas.</p>
              }
            </div>
          </div>
        </ar-panel-card>
      }
    </ar-aulas-page>

    @if (draft(); as d) {
      <ar-modal (close)="closeModal()">
        <p class="modal-title">{{ d.teacherId ? 'Editar professor' : 'Novo professor' }}</p>
        <p class="modal-sub">O professor precisa ter conta no NexaGO — o nome e a foto vêm do perfil dele.</p>
        @if (saveError(); as err) {
          <div class="error-banner">{{ err }}</div>
        }
        @if (d.userId) {
          <div class="field-label spaced">Professor</div>
          <div class="account">
            <span class="account-name">{{ d.name }}</span>
            <span class="account-tag">Conta NexaGO</span>
          </div>
        } @else {
          <div class="field-label spaced">{{ d.teacherId ? 'Vincular conta de ' + d.name : 'Conta NexaGO do professor' }}</div>
          <ar-aula-athlete-picker placeholder="Buscar atleta pelo nome" (selected)="patch({ picked: $event })" />
        }
        <div class="row-2">
          <div>
            <div class="field-label spaced">Modalidade</div>
            <input class="input-box" type="text" maxlength="60" placeholder="Ex.: Beach Tennis · Kids" [value]="d.specialty" (input)="patch({ specialty: $any($event.target).value })" />
          </div>
          <div>
            <div class="field-label spaced">Telefone</div>
            <input class="input-box" type="tel" maxlength="30" [value]="d.phone" (input)="patch({ phone: $any($event.target).value })" />
          </div>
        </div>
        @if (canManagePayout()) {
          <div class="field-label spaced">Repasse</div>
          <div class="chip-row">
            @for (m of payoutModels; track m) {
              <button type="button" class="ar-chip" [class.active]="d.payoutModel === m" (click)="patch({ payoutModel: m })">{{ payoutModelLabels[m] }}</button>
            }
          </div>
          <div class="payout-value">
            @if (d.payoutModel === 'revenue_share') {
              <input class="input-box" type="text" inputmode="decimal" aria-label="Percentual do repasse" [value]="d.payoutValue" (input)="patch({ payoutValue: $any($event.target).value })" />
              <span class="suffix">% das mensalidades pagas</span>
            } @else {
              <span class="prefix">R$</span>
              <input class="input-box" type="text" inputmode="decimal" aria-label="Valor do repasse" [value]="d.payoutValue" (input)="patch({ payoutValue: $any($event.target).value })" />
              <span class="suffix">{{ d.payoutModel === 'per_class' ? 'por aula dada' : 'por aluno presente' }}</span>
            }
          </div>
          <p class="hint">Receita de aluno com horários de professores diferentes é rateada pelos horários. A taxa de matrícula fica com a arena. O pagamento ao professor é feito por fora — o painel só registra.</p>
        }
        <div class="field-label spaced">Cor</div>
        <div class="color-row">
          @for (c of colors; track c) {
            <button type="button" class="color-swatch" [class.active]="d.color === c" [style.background]="c" [attr.aria-label]="'Cor ' + c" (click)="patch({ color: c })"></button>
          }
        </div>
        <div class="modal-actions">
          @if (d.teacherId) {
            <button type="button" class="ar-mini-btn" [disabled]="saving()" (click)="toggleArchive()">
              {{ editingArchived() ? 'Reativar' : 'Arquivar' }}
            </button>
            <span class="grow"></span>
          }
          <button type="button" class="ar-mini-btn" (click)="closeModal()">Cancelar</button>
          <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="saving() || !canSave()" (click)="save()">
            {{ saving() ? 'Salvando…' : 'Salvar' }}
          </button>
        </div>
      </ar-modal>
    }
  `,
  styles: `
    .state-text { font-size: 13.5px; color: var(--nx-text-mute); margin: 0; }
    .state-text.empty { margin: 14px 0 4px; }
    .kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; flex: none; }
    .table-head, .table-row {
      display: grid;
      grid-template-columns: minmax(220px, 1.5fr) minmax(140px, 1fr) 80px 70px minmax(150px, 1fr) 100px 90px;
      gap: 12px;
      align-items: center;
    }
    .table-head { padding-bottom: 9px; border-bottom: 1px solid var(--nx-line-strong); }
    .table-head span {
      font-family: var(--nx-font-mono); font-size: 9px; font-weight: 600; letter-spacing: 0.14em;
      text-transform: uppercase; color: var(--nx-text-dim);
    }
    .table-row { padding: 12px 0; border-bottom: 1px solid var(--nx-line); }
    .table-row:last-child { border-bottom: none; }
    .table-head.with-payout, .table-row.with-payout {
      grid-template-columns: minmax(220px, 1.5fr) minmax(140px, 1fr) 80px 70px minmax(150px, 1fr) minmax(130px, 1fr) 110px 100px 90px;
    }
    .table-row.archived { opacity: 0.55; }
    .who { display: flex; align-items: center; gap: 11px; min-width: 0; }
    .name { font-family: var(--nx-font-display); font-weight: 600; font-size: 13.5px; color: var(--nx-text); }
    .sub { font-family: var(--nx-font-mono); font-size: 10px; color: var(--nx-text-dim); margin-top: 2px; }
    .sub.ok { color: var(--nx-win); }
    .link-warn {
      margin-top: 2px; padding: 0; background: none; border: none; cursor: pointer;
      font-family: var(--nx-font-mono); font-size: 10px; color: var(--nx-pending); text-decoration: underline;
    }
    .account {
      display: flex; align-items: center; gap: 10px; height: 42px; padding: 0 12px; border-radius: var(--nx-r-2);
      background: var(--nx-surface-1); border: 1px solid var(--nx-line);
    }
    .account-name { flex: 1; font-family: var(--nx-font-display); font-weight: 600; font-size: 13.5px; color: var(--nx-text); }
    .account-tag { font-family: var(--nx-font-mono); font-size: 9.5px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--nx-win); }
    .cell { font-size: 12.5px; color: var(--nx-text-mute); }
    .mono { font-family: var(--nx-font-mono); font-size: 12.5px; font-weight: 700; color: var(--nx-text); }
    .occ { display: flex; align-items: center; gap: 8px; }
    .orange { color: var(--nx-orange-500); }
    .link { text-decoration: none; }
    .link:hover { text-decoration: underline; }
    .head-actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .head-actions a { text-decoration: none; display: inline-flex; align-items: center; }
    .payout-value { display: flex; align-items: center; gap: 8px; margin-top: 10px; }
    .payout-value .input-box { width: 110px; flex: none; font-family: var(--nx-font-mono); }
    .prefix, .suffix { font-family: var(--nx-font-mono); font-size: 11px; color: var(--nx-text-dim); }
    .actions { display: flex; justify-content: flex-end; }
    .grow { flex: 1; }
    @media (max-width: 1100px) { .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  `,
})
export class PanelAulasTeachersComponent {
  private readonly arenaContext = inject(ArenaContextService);
  private readonly access = inject(ArenaAccessService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly colors = TEACHER_COLORS;
  protected readonly brl = brl;
  protected readonly payoutModels = PAYOUT_MODELS;
  protected readonly payoutModelLabels = PAYOUT_MODEL_LABEL;
  protected readonly readOnly = computed(() => !this.access.canWrite('agenda'));
  /** Quanto o professor ganha: quem lê o financeiro. O modelo: só o gestor (escreve Aulas + lê financeiro). */
  protected readonly canSeePayout = computed(() => this.access.canRead('financeiro'));
  protected readonly canManagePayout = computed(() => this.access.canWrite('agenda') && this.access.canRead('financeiro'));
  private readonly month = todayKeyLocal().slice(0, 7);
  protected readonly monthShort = monthShortLabel(this.month);
  protected readonly closingDay = shortMonthDay(monthLastDay(this.month));
  protected readonly payout = signal<ArenaPayoutPreview | null>(null);
  /** `?editar=` (vindo do repasse): abre o professor uma vez e sai da URL. */
  private editParam = this.route.snapshot.queryParamMap.get('editar');

  protected readonly teachers = signal<ClassTeacher[]>([]);
  protected readonly classes = signal<ArenaClass[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);

  protected readonly draft = signal<TeacherDraft | null>(null);
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);

  protected readonly activeTeachers = computed(() => this.teachers().filter((t) => t.status === 'active'));
  protected readonly payoutTotal = computed(() =>
    Math.round((this.payout()?.teachers ?? []).reduce((s, t) => s + t.amountReais, 0) * 100) / 100,
  );
  protected readonly stats = computed(() => teacherStats(this.classes()));
  protected readonly totals = computed(() => {
    let classesPerWeek = 0;
    let students = 0;
    let capacity = 0;
    for (const s of this.stats().values()) {
      classesPerWeek += s.classesPerWeek;
      students += s.students;
      capacity += s.capacity;
    }
    return { classesPerWeek, students, pct: capacity > 0 ? Math.round((students / capacity) * 100) : 0 };
  });
  protected readonly canSave = computed(() => {
    const d = this.draft();
    return d != null && (d.userId != null || d.picked != null);
  });

  protected modelLabel(t: ClassTeacher): string {
    return payoutModelLabel(t.payout);
  }

  protected toPay(teacherId: string): string {
    const p = this.payout();
    if (!p) return '—';
    return brl(p.teachers.find((t) => t.teacherId === teacherId)?.amountReais ?? 0);
  }
  protected readonly editingArchived = computed(() => {
    const id = this.draft()?.teacherId;
    return id != null && this.teachers().find((t) => t.id === id)?.status === 'archived';
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
      const [teachers, classes] = await Promise.all([fetchTeachers(db, arenaId), fetchClasses(db, arenaId)]);
      this.teachers.set([...teachers].sort((a, b) => (a.status === b.status ? 0 : a.status === 'active' ? -1 : 1)));
      this.classes.set(classes);
      if (this.canSeePayout()) void this.loadPayout(arenaId);
      if (this.editParam) {
        const editing = teachers.find((t) => t.id === this.editParam);
        this.editParam = null;
        void this.router.navigate([], { relativeTo: this.route, queryParams: { editar: null }, queryParamsHandling: 'merge', replaceUrl: true });
        if (editing) this.openEdit(editing);
      }
    } catch {
      this.loadError.set('Não foi possível carregar os professores.');
    } finally {
      this.loading.set(false);
    }
  }

  /** Prévia do mês corrente — a página não depende dela (sem ela, as colunas mostram "—"). */
  private async loadPayout(arenaId: string): Promise<void> {
    try {
      this.payout.set(await previewPayouts(arenaFunctions(), arenaId, this.month));
    } catch {
      this.payout.set(null);
    }
  }

  protected openNew(): void {
    if (this.readOnly()) return;
    const used = new Set(this.teachers().map((t) => t.color));
    const color = TEACHER_COLORS.find((c) => !used.has(c)) ?? TEACHER_COLORS[0]!;
    this.saveError.set(null);
    this.draft.set({
      teacherId: null, userId: null, name: '', picked: null, specialty: '', phone: '', color,
      payoutModel: DEFAULT_PAYOUT_MODEL.model, payoutValue: payoutDraftValue(DEFAULT_PAYOUT_MODEL),
    });
  }

  protected openEdit(t: ClassTeacher): void {
    if (this.readOnly()) return;
    this.saveError.set(null);
    this.draft.set({
      teacherId: t.id, userId: t.userId, name: t.name, picked: null,
      specialty: t.specialty ?? '', phone: t.phone ?? '', color: t.color,
      payoutModel: (t.payout ?? DEFAULT_PAYOUT_MODEL).model,
      payoutValue: payoutDraftValue(t.payout ?? DEFAULT_PAYOUT_MODEL),
    });
  }

  protected patch(change: Partial<TeacherDraft>): void {
    const d = this.draft();
    if (!d) return;
    // Trocar de modelo troca a unidade (% ↔ R$): o valor anterior não serve.
    const reset = change.payoutModel && change.payoutModel !== d.payoutModel && change.payoutValue === undefined;
    this.draft.set({ ...d, ...change, ...(reset ? { payoutValue: '' } : {}) });
  }

  protected closeModal(): void {
    if (!this.saving()) this.draft.set(null);
  }

  protected save(): Promise<void> {
    return this.persist(this.editingArchived() ? 'archived' : 'active');
  }

  protected toggleArchive(): Promise<void> {
    return this.persist(this.editingArchived() ? 'active' : 'archived');
  }

  private async persist(status: 'active' | 'archived'): Promise<void> {
    const d = this.draft();
    const arenaId = this.arenaContext.arenaId();
    if (!d || !arenaId || this.readOnly()) return;
    const payout = this.canManagePayout() ? payoutModelFromDraft(d.payoutModel, d.payoutValue) : undefined;
    if (typeof payout === 'string') {
      this.saveError.set(payout);
      return;
    }
    this.saving.set(true);
    this.saveError.set(null);
    try {
      await upsertTeacher(arenaFunctions(), {
        arenaId,
        teacherId: d.teacherId ?? undefined,
        userId: d.userId ?? d.picked?.id,
        specialty: d.specialty.trim() || null,
        phone: d.phone.trim() || null,
        color: d.color,
        status,
        payout,
      });
      this.draft.set(null);
      await this.load(arenaId);
    } catch (err) {
      this.saveError.set(err instanceof Error ? err.message : 'Não foi possível salvar o professor.');
    } finally {
      this.saving.set(false);
    }
  }
}
