import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, output, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CenterContextService } from '../../core/center-context.service';
import { ContractsActions, contractErrorMessage, type SendContractsResult } from '../../data/actions/contracts.actions';
import { CenterStore } from '../../data/center-store.service';
import { contractTerm, pendingDuplicate, suggestedTemplateId, type ContractTemplate } from '../../domain/contracts';
import { formatDayKey } from '../../domain/dates';
import { formatBRL } from '../../domain/money';
import { ENROLLMENT_STATUS, type Enrollment } from '../../domain/models';
import { IconComponent } from '../../ui/icon.component';
import { BannerComponent, ModalComponent, PersonComponent, SegmentedComponent } from '../../ui/kit';

/** Matrícula que aceita contrato: em andamento e com o contrato (snapshot) já congelado. */
const SENDABLE_ENROLLMENT = new Set<Enrollment['status']>(['pending', 'active', 'paused']);

interface TemplateRow {
  t: ContractTemplate;
  disabled: boolean;
  hint: string;
  suggested: boolean;
}

/**
 * K2 — Enviar contrato. Escolhe aluno, matrícula e os modelos publicados; o servidor preenche o
 * texto, congela (hash) e avisa o aluno no app (`sendTrainingCenterContracts`). Reutilizável:
 * `studentId`/`enrollmentId` chegam pré-preenchidos do detalhe do aluno e da nova matrícula.
 */
@Component({
  selector: 'ct-send-contract-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ModalComponent, PersonComponent, BannerComponent, SegmentedComponent, IconComponent],
  template: `
    <ct-modal [kicker]="kicker()" [title]="done() ? 'Contrato enviado' : 'Enviar contrato'" [width]="600" (closed)="closed.emit()">
      @if (done(); as r) {
        <ct-banner [inline]="true" tone="green" [title]="r.contracts.length === 1 ? 'Documento enviado para assinatura' : r.contracts.length + ' documentos enviados para assinatura'">
          {{ r.notified ? 'O aluno recebeu o aviso no app NexaGO.' : 'Aluno sem conta NexaGO vinculada: o contrato fica esperando ele entrar no app.' }}
        </ct-banner>
        @for (c of r.contracts; track c.contractId) {
          <div class="ct-list-row">
            <ct-icon name="doc" [size]="16" />
            <div class="ct-grow"><div class="ct-disp">{{ c.title }}</div><div class="ct-mono">{{ c.number }}</div></div>
            <a class="ct-mini-btn" [routerLink]="['/centro', centerId(), 'contratos', c.contractId]" (click)="closed.emit()">Ver contrato</a>
          </div>
        }
      } @else {
        <!-- Aluno -->
        @if (student(); as s) {
          <div class="ct-row">
            <ct-person class="ct-grow" [name]="s.name" [colorKey]="s.id" [size]="34" [sub]="s.isMinor ? 'Menor · responsável ' + (s.guardian?.name || 'não informado') : s.email">
              @if (s.isMinor) {
                <span class="ct-tag blue">Menor</span>
              }
            </ct-person>
            <button type="button" class="ct-ghost-btn" (click)="clearStudent()">Trocar</button>
          </div>
        } @else {
          <div class="ct-field">
            <label for="sc-q">Aluno</label>
            <input id="sc-q" class="ct-input" placeholder="Buscar por nome ou e-mail" [value]="query()" (input)="query.set(value($event))" />
          </div>
          <div class="list">
            @for (s of students(); track s.id) {
              <button type="button" class="pick" (click)="pickStudent(s.id)">
                <ct-person [name]="s.name" [colorKey]="s.id" [size]="28" [sub]="s.isMinor && s.guardian ? 'Menor · responsável ' + s.guardian.name : s.email" />
              </button>
            } @empty {
              <div class="ct-dim">{{ query() ? 'Nenhum aluno encontrado.' : 'Nenhum aluno ativo.' }}</div>
            }
          </div>
        }

        @if (student(); as s) {
          <!-- Matrícula -->
          <div>
            <div class="ct-label sec">Matrícula</div>
            <div class="ct-col" style="gap: 8px">
              @for (e of enrollments(); track e.id) {
                <button type="button" class="ct-option" [class.on]="e.id === enrollmentChoice()" (click)="enrollmentChoice.set(e.id)">
                  <span class="ct-row">
                    <span class="ct-grow"><strong>{{ e.className }}</strong><span>{{ e.contract?.planName }} · desde {{ day(e.startDate) }}</span></span>
                    <span class="ct-pill" [class]="'ct-pill ' + enrollmentStatus[e.status][1]">{{ enrollmentStatus[e.status][0] }}</span>
                  </span>
                </button>
              }
              <button type="button" class="ct-option" [class.on]="enrollmentChoice() === null" (click)="enrollmentChoice.set(null)">
                <strong>Sem matrícula</strong><span>Só termos avulsos (uso de imagem, saúde…)</span>
              </button>
            </div>
          </div>

          <!-- Documentos -->
          <div>
            <div class="ct-label sec">Documentos</div>
            @for (r of templateRows(); track r.t.id) {
              <label class="doc" [class.off]="r.disabled">
                <input type="checkbox" class="ct-checkbox-input" [checked]="selected().has(r.t.id)" [disabled]="r.disabled" (change)="toggle(r.t.id)" />
                <span class="ct-checkbox-box">
                  @if (selected().has(r.t.id)) {
                    <ct-icon name="check" [size]="12" [stroke]="3" style="color: #0a0a0a" />
                  }
                </span>
                <span class="ct-grow">
                  <span class="ct-row" style="gap: 6px">
                    <span class="ct-disp">{{ r.t.name }}{{ r.t.version ? ' v' + r.t.version : '' }}</span>
                    @if (r.suggested) {
                      <span class="ct-tag orange">Sugerido</span>
                    }
                  </span>
                  <span class="ct-dim">{{ r.hint }}</span>
                </span>
              </label>
            } @empty {
              <div class="ct-dim">Nenhum modelo de contrato ainda. Crie e publique um em “Modelos”.</div>
            }
          </div>

          <!-- Resumo -->
          <div class="ct-box">
            @if (enrollment(); as e) {
              <div class="ct-kv"><span>Plano</span><span>{{ planLine(e) }}</span></div>
            }
            <div class="ct-kv"><span>Vigência</span><span>{{ termLine() }}</span></div>
            <div class="ct-kv"><span>Signatário</span><span>{{ signerLine() }}</span></div>
            <div class="ct-kv"><span>Envio</span><span>{{ s.uid ? 'App NexaGO' : 'Aguardando conta' }}</span></div>
          </div>
          @if (!s.uid) {
            <ct-banner [inline]="true" tone="yellow">Aluno sem conta NexaGO vinculada: o contrato fica esperando ele entrar no app.</ct-banner>
          }
          @if (s.isMinor && !s.guardian?.name) {
            <ct-banner [inline]="true" tone="red">Aluno menor sem responsável legal cadastrado: complete o cadastro antes de enviar.</ct-banner>
          }

          @if (hasEnrollmentDoc()) {
            <div class="policy">
              <div class="ct-grow">
                <div class="ct-disp">Exigir assinatura antes do pagamento</div>
                <div class="ct-dim">O app só libera o pagamento depois que o contrato for assinado</div>
              </div>
              <ct-segmented [options]="yesNo" [(value)]="requireBefore" />
            </div>
          }
        }

        @if (error()) {
          <div class="ct-error-text">{{ error() }}</div>
        }
      }

      <div footer class="ct-row ct-wrap">
        @if (done()) {
          <button type="button" class="ct-mini-btn ct-mini-btn-primary" (click)="closed.emit()">Fechar</button>
        } @else {
          <button type="button" class="ct-mini-btn" (click)="closed.emit()">Cancelar</button>
          <button type="button" class="ct-mini-btn ct-mini-btn-primary" [disabled]="!canSubmit()" (click)="submit()">
            {{ busy() ? 'Enviando…' : 'Enviar para assinatura' }}
          </button>
        }
      </div>
    </ct-modal>
  `,
  styles: `
    .list { display: flex; flex-direction: column; gap: 6px; max-height: 300px; overflow-y: auto; }
    .pick { padding: 9px 12px; border-radius: var(--nx-r-3); border: 1px solid var(--nx-line); background: var(--nx-surface-0); cursor: pointer; text-align: left; font: inherit; color: var(--nx-text); }
    .pick:hover { background: var(--nx-surface-1); }
    .sec { display: block; margin-bottom: 8px; }
    .doc { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-top: 1px solid var(--nx-line); cursor: pointer; }
    .doc:first-of-type { border-top: none; }
    .doc.off { opacity: 0.45; cursor: default; }
    .doc .ct-grow { display: flex; flex-direction: column; gap: 2px; }
    .policy { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding: 12px 14px; border-radius: var(--nx-r-3); border: 1px solid var(--nx-line); background: var(--nx-surface-0); }
  `,
})
export class SendContractModalComponent {
  /** Pré-preenchidos (detalhe do aluno, nova matrícula). */
  readonly studentId = input<string | null>(null);
  readonly enrollmentId = input<string | null>(null);
  readonly closed = output<void>();
  readonly sent = output<SendContractsResult>();

  private readonly ctx = inject(CenterContextService);
  private readonly store = inject(CenterStore);
  private readonly actions = inject(ContractsActions);

  protected readonly enrollmentStatus = ENROLLMENT_STATUS;
  protected readonly yesNo = [
    { value: 'yes', label: 'Sim' },
    { value: 'no', label: 'Não' },
  ];

  protected readonly centerId = computed(() => this.ctx.activeCenterId() ?? '');
  protected readonly query = signal('');
  protected readonly studentChoice = linkedSignal(() => this.studentId());
  protected readonly requireBefore = signal('yes');
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly done = signal<SendContractsResult | null>(null);

  protected readonly student = computed(() => {
    const id = this.studentChoice();
    return id ? (this.store.studentById(id) ?? null) : null;
  });

  protected readonly students = computed(() => {
    const q = this.query().trim().toLowerCase();
    return this.store
      .students()
      .filter((s) => s.status === 'active' || s.status === 'invited')
      .filter((s) => !q || s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q))
      .slice(0, 50);
  });

  protected readonly enrollments = computed(() => {
    const id = this.studentChoice();
    return this.store
      .enrollments()
      .filter((e) => e.studentId === id && SENDABLE_ENROLLMENT.has(e.status) && e.contract != null)
      .sort((a, b) => b.startDate.localeCompare(a.startDate));
  });

  /** A pedida (se vale) ou a única em andamento; trocar de aluno recalcula. */
  protected readonly enrollmentChoice = linkedSignal<{ list: Enrollment[]; preset: string | null }, string | null>({
    source: () => ({ list: this.enrollments(), preset: this.enrollmentId() }),
    computation: ({ list, preset }, previous) => {
      if (previous && list.some((e) => e.id === previous.value)) return previous.value;
      if (preset && list.some((e) => e.id === preset)) return preset;
      return list.length === 1 ? list[0]!.id : null;
    },
  });

  protected readonly enrollment = computed(() => {
    const id = this.enrollmentChoice();
    return id ? (this.enrollments().find((e) => e.id === id) ?? null) : null;
  });

  private readonly templates = computed(() => this.store.contractTemplates().filter((t) => t.status !== 'archived'));
  private readonly suggestedId = computed(() => {
    const s = this.student();
    return s ? suggestedTemplateId(this.templates(), s.isMinor) : null;
  });

  protected readonly templateRows = computed<TemplateRow[]>(() => {
    const s = this.student();
    const eId = this.enrollmentChoice();
    return this.templates().map((t) => {
      const usable = t.status === 'published' && t.version > 0;
      const dup = s && usable ? pendingDuplicate(this.store.contracts(), s.id, t, eId) : null;
      const needsEnrollment = t.kind === 'enrollment' && !eId;
      const disabled = !usable || needsEnrollment || !!dup;
      const hint = !usable
        ? 'Rascunho · publique para usar'
        : dup
          ? 'Já aguardando assinatura · use “Reenviar lembrete”'
          : needsEnrollment
            ? 'Contrato de matrícula · escolha a matrícula acima'
            : t.kind === 'enrollment'
              ? 'Preenchido com plano, turma e cobrança'
              : t.optional
                ? 'Opcional · aluno pode recusar'
                : 'Termo avulso · sem vigência';
      return { t, disabled, hint, suggested: usable && t.id === this.suggestedId() };
    });
  });

  /** Seleção: o sugerido entra marcado; recomeça quando muda aluno ou matrícula. */
  protected readonly selected = linkedSignal<string, Set<string>>({
    source: () => `${this.studentChoice()}|${this.enrollmentChoice()}|${this.suggestedId()}`,
    computation: () => {
      const id = this.suggestedId();
      // Sem rastrear as linhas: o feed de contratos mudando não pode desmarcar o que o usuário marcou.
      const row = untracked(() => this.templateRows()).find((r) => r.t.id === id);
      return new Set(row && !row.disabled ? [row.t.id] : []);
    },
  });

  /** Só entra o que ainda pode ir (o feed pode ter mudado depois de marcar). */
  private readonly chosen = computed(() => this.templateRows().filter((r) => !r.disabled && this.selected().has(r.t.id)));
  protected readonly hasEnrollmentDoc = computed(() => this.chosen().some((r) => r.t.kind === 'enrollment'));

  protected readonly canSubmit = computed(() => {
    const s = this.student();
    return !!s && this.chosen().length > 0 && this.chosen().length <= 5 && !this.busy() && this.ctx.canWrite() && !(s.isMinor && !s.guardian?.name);
  });

  protected readonly kicker = computed(() => {
    const s = this.student();
    const e = this.enrollment();
    return s ? [s.name, e ? `matrícula ${e.className}` : ''].filter(Boolean).join(' · ') : 'Contratos';
  });

  protected readonly termLine = computed(() => {
    const e = this.enrollment();
    if (!e || !this.hasEnrollmentDoc()) return 'Indeterminado (termo)';
    const t = contractTerm('enrollment', e);
    return t.startDate && t.endDate ? `${formatDayKey(t.startDate, true)} → ${formatDayKey(t.endDate, true)}` : 'Conforme o plano';
  });

  protected readonly signerLine = computed(() => {
    const s = this.student();
    if (!s) return '—';
    if (!s.isMinor) return `${s.name} · maior de idade`;
    return s.guardian?.name ? `${s.guardian.name} · responsável legal` : 'Responsável não cadastrado';
  });

  protected value(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  protected day(key: string): string {
    return formatDayKey(key, true);
  }

  protected planLine(e: Enrollment): string {
    const c = e.contract;
    if (!c) return '—';
    return `${c.planName} · ${formatBRL(c.priceCents)}${c.planType === 'monthly' ? '/mês' : ''}`;
  }

  protected pickStudent(id: string): void {
    this.studentChoice.set(id);
    this.error.set('');
  }

  protected clearStudent(): void {
    this.studentChoice.set(null);
    this.error.set('');
  }

  protected toggle(id: string): void {
    this.selected.update((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  protected async submit(): Promise<void> {
    const s = this.student();
    if (!s || !this.canSubmit()) return;
    const docs = this.chosen().map((r) => r.t);
    this.busy.set(true);
    this.error.set('');
    try {
      const r = await this.actions.send({
        studentId: s.id,
        // Só manda a matrícula quando vai contrato de matrícula (termo avulso não amarra).
        enrollmentId: docs.some((t) => t.kind === 'enrollment') ? this.enrollmentChoice() : null,
        templateIds: docs.map((t) => t.id),
        requireBeforePayment: this.hasEnrollmentDoc() && this.requireBefore() === 'yes',
      });
      this.done.set(r);
      this.sent.emit(r);
    } catch (err) {
      this.error.set(contractErrorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }
}
