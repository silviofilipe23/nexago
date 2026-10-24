import { ChangeDetectionStrategy, Component, computed, inject, input, OnInit, output, signal } from '@angular/core';
import { CenterContextService } from '../../core/center-context.service';
import { writeErrorMessage } from '../../data/actions/actor';
import { StudentsActions } from '../../data/actions/students.actions';
import { CenterStore } from '../../data/center-store.service';
import { freeSeats } from '../../domain/enrollment';
import { formatBRL } from '../../domain/money';
import { weekdaysLabel } from '../../domain/schedule';
import { BannerComponent, ModalComponent } from '../../ui/kit';
import { plansForProgram } from '../enrollments/enrollment-view';
import { firstName, type Lead } from './lead-model';
import { LeadsService } from './leads.service';

/**
 * C4 — Converter em matrícula: resume o que vai acontecer e prepara o aluno (cria a partir do
 * interessado, com convite por e-mail se ainda não tem conta). A matrícula em si é a mesma do
 * painel (vaga em transação, contrato, 1ª cobrança e auditoria): o pai abre o `ct-new-enrollment`
 * já com o aluno e a turma indicada.
 */
@Component({
  selector: 'ct-convert-lead',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ModalComponent, BannerComponent],
  template: `
    <ct-modal title="Matricular" [kicker]="kicker()" [width]="600" (closed)="closed.emit()">
      <div class="pair">
        <div class="box" [class.on]="!!suggested()">
          <div class="ct-kick" [class.or]="!!suggested()">{{ suggested() ? 'Turma · sugerida pelo professor' : 'Turma' }}</div>
          @if (cls(); as c) {
            <div class="ct-disp big">{{ c.name }}</div>
            <div class="ct-mono small">{{ weekdaysLabel(c.weekdays) }} {{ c.startTime }} · {{ c.seatsTaken }}/{{ c.capacity }}{{ freeSeats(c) === 0 ? ' · lotada' : '' }}</div>
          } @else {
            <div class="ct-disp big">Escolher no próximo passo</div>
          }
        </div>
        <div class="box">
          <div class="ct-kick">Plano</div>
          @if (plans().length) {
            <div class="ct-disp big">{{ plans()[0]!.name }}{{ plans().length > 1 ? ' +' + (plans().length - 1) : '' }}</div>
            <div class="ct-mono small">{{ formatBRL(plans()[0]!.priceCents) }}{{ plans()[0]!.type === 'monthly' ? '/mês' : '' }}</div>
          } @else {
            <div class="ct-disp big">Escolher no próximo passo</div>
          }
        </div>
      </div>

      @if (needsEmail()) {
        <div class="ct-field">
          <label class="ct-label" for="cv-email">E-mail para o convite da conta NexaGO</label>
          <input id="cv-email" class="ct-input" type="email" [value]="email()" (input)="email.set(v($event))" maxlength="120" />
        </div>
      }

      <div>
        <div class="ct-kick">O que {{ first() }} recebe</div>
        @for (s of steps(); track s.n) {
          <div class="step">
            <span class="num ct-mono">{{ s.n }}</span>
            <div><div class="ct-disp">{{ s.t }}</div><div class="ct-dim small">{{ s.s }}</div></div>
          </div>
        }
      </div>
      <ct-banner tone="yellow" [inline]="true" [title]="'Vaga reservada por ' + holdHours() + 'h'">
        A matrícula nasce pendente e segura a vaga. Sem pagamento no prazo, ela volta para a lista de espera.
      </ct-banner>
      @if (error()) {
        <p class="ct-error-text" role="alert">{{ error() }}</p>
      }
      <ng-container footer>
        <button type="button" class="ct-ghost-btn" (click)="closed.emit()">Cancelar</button>
        <button type="button" class="ct-mini-btn ct-mini-btn-primary" [disabled]="busy()" (click)="go()">
          {{ busy() ? 'Preparando…' : 'Continuar para a matrícula' }}
        </button>
      </ng-container>
    </ct-modal>
  `,
  styles: `
    .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .box { padding: 12px; border-radius: var(--nx-r-3); background: var(--nx-surface-0); border: 1px solid var(--nx-line); }
    .box.on { background: rgba(255,106,26,0.08); border-color: var(--nx-orange-500); }
    .ct-kick.or { color: var(--nx-orange-400); }
    .big { margin-top: 6px; font-size: 13.5px; font-weight: 700; }
    .small { font-size: 11px; margin-top: 2px; }
    .step { display: flex; gap: 12px; padding: 8px 0; }
    .num { width: 22px; height: 22px; border-radius: 7px; background: var(--nx-surface-2); display: grid; place-items: center; font-size: 10.5px; font-weight: 700; color: var(--nx-text); flex: none; }
    @media (max-width: 520px) { .pair { grid-template-columns: 1fr; } }
  `,
})
export class ConvertLeadComponent implements OnInit {
  readonly lead = input.required<Lead>();
  readonly closed = output<void>();
  /** Aluno pronto: o pai abre a matrícula com ele e a turma. */
  readonly ready = output<{ studentId: string; classId: string | null }>();

  private readonly ctx = inject(CenterContextService);
  private readonly store = inject(CenterStore);
  private readonly students = inject(StudentsActions);
  private readonly leads = inject(LeadsService);

  protected readonly formatBRL = formatBRL;
  protected readonly weekdaysLabel = weekdaysLabel;
  protected readonly freeSeats = freeSeats;

  protected readonly email = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected readonly first = computed(() => firstName(this.lead().name));
  protected readonly suggested = computed(() => this.lead().coachFeedback?.classId || '');
  protected readonly cls = computed(() => {
    const id = this.suggested() || this.lead().trial?.classId || '';
    return id ? (this.store.classById(id) ?? null) : null;
  });
  protected readonly plans = computed(() => {
    const programId = this.cls()?.programId || this.lead().interest.programId;
    const list = programId ? plansForProgram(this.store.plans(), programId) : [];
    return list.filter((p) => p.status !== 'archived');
  });
  protected readonly student = computed(() => (this.lead().studentId ? (this.store.studentById(this.lead().studentId!) ?? null) : null));
  protected readonly needsEmail = computed(() => !this.student() && !this.lead().athleteId);
  protected readonly holdHours = computed(() => this.ctx.center()?.policies.pendingHoldHours ?? 48);
  protected readonly kicker = computed(() => {
    const l = this.lead();
    return l.trial?.attendance === 'attended' ? `${l.name} · fez experimental` : l.name;
  });
  protected readonly steps = computed(() => {
    const hasContract = this.store.contractTemplates().some((t) => t.status === 'published' && t.kind === 'enrollment' && t.version > 0);
    const out: { n: number; t: string; s: string }[] = [];
    if (this.needsEmail()) out.push({ n: 0, t: 'Convite para criar conta NexaGO', s: 'Nome e telefone já vêm do cadastro' });
    if (hasContract) out.push({ n: 0, t: 'Contrato de matrícula', s: 'Enviado depois da matrícula · assinatura no app' });
    out.push({ n: 0, t: 'Pagamento', s: 'Pix pelo app (1º mês proporcional quando a mensalidade tem vencimento fixo)' });
    return out.map((s, i) => ({ ...s, n: i + 1 }));
  });

  ngOnInit(): void {
    this.email.set(this.lead().email);
  }

  protected v(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  protected async go(): Promise<void> {
    if (this.busy()) return;
    const l = this.lead();
    const classId = this.cls()?.id ?? null;
    const existing = this.student();
    if (existing) {
      this.ready.emit({ studentId: existing.id, classId });
      return;
    }
    const email = this.email().trim().toLowerCase();
    if (this.needsEmail() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.error.set('Informe o e-mail: é por ele que a pessoa aceita o convite no app.');
      return;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      const studentId = await this.students.addStudent({
        uid: l.athleteId,
        name: l.name,
        email,
        phone: l.phone,
        isMinor: false,
        birthDate: null,
        guardian: null,
        imageUseAllowed: false,
        notifyClasses: true,
        emergencyName: '',
        emergencyPhone: '',
        medicalNotes: '',
      });
      await this.leads.linkStudent(l, studentId);
      this.ready.emit({ studentId, classId });
    } catch (e) {
      this.error.set(writeErrorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
