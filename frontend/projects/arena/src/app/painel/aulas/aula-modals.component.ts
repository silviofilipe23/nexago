import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, output, signal } from '@angular/core';
import { arenaFirestore } from '../data/firestore';
import { arenaFunctions } from '../data/functions';
import { searchAthletes, type AthleteSearchResult } from '../clubinho/clubs-repository';
import { ModalComponent } from '../ui/modal.component';
import { CANCEL_REASON_LABEL, weekdayDateLabel, type CancelReason, type ClassSession } from './class.model';
import { addClassStudent, cancelClassSession } from './classes-repository';

/** A4 · Cancelar aula — libera a quadra e avisa por push os alunos com conta NexaGO.
 *  Crédito de reposição fica para a fase 2. */
@Component({
  selector: 'ar-aula-cancel-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ModalComponent],
  styleUrl: './aulas-form.scss',
  template: `
    <ar-modal (close)="dismiss()">
      <p class="modal-title">Cancelar aula</p>
      <p class="modal-sub">{{ session().className }} · {{ dateLabel(session().date) }} · {{ session().startTime }}</p>
      @if (error(); as err) {
        <div class="error-banner">{{ err }}</div>
      }
      <div class="field-label spaced">Motivo</div>
      <div class="chip-row">
        @for (r of reasons; track r) {
          <button type="button" class="ar-chip" [class.active]="reason() === r" (click)="reason.set(r)">{{ reasonLabel[r] }}</button>
        }
      </div>
      <div class="field-label spaced">Recado para os alunos (opcional)</div>
      <input class="input-box" type="text" maxlength="300" placeholder="Ex.: remarcamos para sábado 9h" [value]="note()" (input)="note.set($any($event.target).value)" />
      <p class="hint">
        A quadra volta para o aluguel na hora e os alunos com conta NexaGO recebem um aviso no
        app. A turma segue normal nas outras datas.
      </p>
      <div class="modal-actions">
        <button type="button" class="ar-mini-btn" [disabled]="busy()" (click)="dismiss()">Voltar</button>
        <button type="button" class="ar-mini-btn ar-mini-btn-primary danger" [disabled]="busy()" (click)="confirm()">
          {{ busy() ? 'Cancelando…' : 'Cancelar aula' }}
        </button>
      </div>
    </ar-modal>
  `,
  styles: `
    .danger { background: var(--nx-live); border-color: var(--nx-live); color: #fff; }
  `,
})
export class AulaCancelModalComponent {
  readonly session = input.required<Pick<ClassSession, 'id' | 'className' | 'date' | 'startTime'>>();
  readonly closed = output<void>();
  readonly canceled = output<number>();

  protected readonly reasons = Object.keys(CANCEL_REASON_LABEL) as CancelReason[];
  protected readonly reasonLabel = CANCEL_REASON_LABEL;
  protected readonly dateLabel = weekdayDateLabel;
  protected readonly reason = signal<CancelReason>('rain');
  protected readonly note = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected dismiss(): void {
    if (!this.busy()) this.closed.emit();
  }

  protected async confirm(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const result = await cancelClassSession(arenaFunctions(), this.session().id, this.reason(), this.note().trim() || null);
      this.canceled.emit(result.notified);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Não foi possível cancelar a aula.');
    } finally {
      this.busy.set(false);
    }
  }
}

/** Matricular aluno na turma: atleta NexaGO (busca no perfil público) ou aluno sem conta. */
@Component({
  selector: 'ar-aula-enroll-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ModalComponent],
  styleUrl: './aulas-form.scss',
  template: `
    <ar-modal (close)="dismiss()">
      <p class="modal-title">Matricular aluno</p>
      <p class="modal-sub">{{ className() }} · {{ spotsLeft() }} vaga{{ spotsLeft() === 1 ? '' : 's' }} livre{{ spotsLeft() === 1 ? '' : 's' }}</p>
      @if (error(); as err) {
        <div class="error-banner">{{ err }}</div>
      }
      <div class="ar-chart-tabs mode">
        <button type="button" [class.active]="mode() === 'athlete'" (click)="mode.set('athlete')">Atleta NexaGO</button>
        <button type="button" [class.active]="mode() === 'guest'" (click)="mode.set('guest')">Sem conta</button>
      </div>
      @if (mode() === 'athlete') {
        <div class="field-label spaced">Buscar atleta</div>
        <input class="input-box" type="search" placeholder="Nome ou apelido" [value]="term()" (input)="onTerm($any($event.target).value)" />
        <div class="results">
          @if (searching()) {
            <p class="hint">Buscando…</p>
          }
          @for (a of results(); track a.id) {
            <button type="button" class="result" [class.active]="picked()?.id === a.id" (click)="picked.set(a)">
              <span class="av">{{ initials(a.name) }}</span>
              <span class="result-name">{{ a.name }}</span>
              @if (picked()?.id === a.id) {
                <span class="check">✓</span>
              }
            </button>
          } @empty {
            @if (term().trim().length >= 2 && !searching()) {
              <p class="hint">Nenhum atleta encontrado. Use "Sem conta" para cadastrar só o nome.</p>
            }
          }
        </div>
        <p class="hint">Aluno com conta recebe aviso no app quando a aula é cancelada.</p>
      } @else {
        <div class="field-label spaced">Nome do aluno</div>
        <input class="input-box" type="text" maxlength="80" [value]="guestName()" (input)="guestName.set($any($event.target).value)" />
        <div class="field-label spaced">Telefone (opcional)</div>
        <input class="input-box" type="tel" maxlength="30" [value]="guestPhone()" (input)="guestPhone.set($any($event.target).value)" />
      }
      <div class="modal-actions">
        <button type="button" class="ar-mini-btn" [disabled]="busy()" (click)="dismiss()">Cancelar</button>
        <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="busy() || !canSubmit()" (click)="submit()">
          {{ busy() ? 'Matriculando…' : 'Matricular' }}
        </button>
      </div>
    </ar-modal>
  `,
  styles: `
    .mode { margin-top: 4px; align-self: flex-start; display: inline-flex; }
    .results { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; max-height: 240px; overflow-y: auto; }
    .result {
      display: flex; align-items: center; gap: 10px; padding: 8px 10px; text-align: left; cursor: pointer;
      border-radius: var(--nx-r-2); background: var(--nx-surface-1); border: 1px solid var(--nx-line); color: var(--nx-text);
    }
    .result.active { background: var(--nx-orange-tint); border-color: rgba(255, 106, 26, 0.45); }
    .av {
      width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; flex: none;
      background: var(--nx-surface-2); font-family: var(--nx-font-display); font-weight: 700; font-size: 11px; color: var(--nx-text-mute);
    }
    .result-name { flex: 1; font-family: var(--nx-font-display); font-weight: 600; font-size: 13px; }
    .check { color: var(--nx-orange-500); font-weight: 700; }
  `,
})
export class AulaEnrollModalComponent {
  readonly classId = input.required<string>();
  readonly className = input.required<string>();
  readonly spotsLeft = input.required<number>();
  readonly closed = output<void>();
  readonly enrolled = output<void>();

  protected readonly mode = signal<'athlete' | 'guest'>('athlete');
  protected readonly term = signal('');
  protected readonly results = signal<AthleteSearchResult[]>([]);
  protected readonly searching = signal(false);
  protected readonly picked = signal<AthleteSearchResult | null>(null);
  protected readonly guestName = signal('');
  protected readonly guestPhone = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly canSubmit = computed(() =>
    this.mode() === 'athlete' ? this.picked() != null : this.guestName().trim().length >= 2,
  );

  private timer: ReturnType<typeof setTimeout> | null = null;
  private searchSeq = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      if (this.timer) clearTimeout(this.timer);
    });
  }

  protected initials(name: string): string {
    const parts = name.trim().split(/\s+/);
    return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1]![0] ?? '' : '')).toUpperCase();
  }

  protected onTerm(value: string): void {
    this.term.set(value);
    this.picked.set(null);
    if (this.timer) clearTimeout(this.timer);
    if (value.trim().length < 2) {
      this.results.set([]);
      return;
    }
    const seq = ++this.searchSeq;
    this.searching.set(true);
    this.timer = setTimeout(() => {
      searchAthletes(arenaFirestore(), value)
        .then((r) => {
          if (seq === this.searchSeq) this.results.set(r);
        })
        .catch(() => {
          if (seq === this.searchSeq) this.results.set([]);
        })
        .finally(() => {
          if (seq === this.searchSeq) this.searching.set(false);
        });
    }, 300);
  }

  protected dismiss(): void {
    if (!this.busy()) this.closed.emit();
  }

  protected async submit(): Promise<void> {
    if (!this.canSubmit()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const input =
        this.mode() === 'athlete'
          ? { athleteId: this.picked()!.id }
          : { name: this.guestName().trim(), phone: this.guestPhone().trim() || undefined };
      await addClassStudent(arenaFunctions(), this.classId(), input);
      this.enrolled.emit();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Não foi possível matricular o aluno.');
    } finally {
      this.busy.set(false);
    }
  }
}
