import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import type { AthleteSearchResult } from '../clubinho/clubs-repository';
import { ArenaContextService } from '../data/arena-context.service';
import { arenaFirestore } from '../data/firestore';
import { arenaFunctions } from '../data/functions';
import { ModalComponent } from '../ui/modal.component';
import { AulaAthletePickerComponent } from './aula-modals.component';
import type { MakeupCredit } from './billing.model';
import { addExtra, fetchAvailableCredits } from './billing-repository';
import { shortDate, weekdayDateLabel, type ClassSession } from './class.model';

/** Créditos que servem para esta aula: vencem nela ou depois, de quem ainda não está na lista. */
export function usableCredits(credits: readonly MakeupCredit[], sessionDate: string, inRoster: ReadonlySet<string>): MakeupCredit[] {
  return credits
    .filter((c) => c.status === 'available' && c.expiresOn >= sessionDate && !inRoster.has(c.studentId))
    .sort((a, b) => a.expiresOn.localeCompare(b.expiresOn) || a.name.localeCompare(b.name, 'pt-BR'));
}

/** 05 · Encaixar na aula: reposição (usa 1 crédito) ou aula experimental. */
@Component({
  selector: 'ar-aula-extra-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ModalComponent, AulaAthletePickerComponent],
  styleUrl: './aulas-form.scss',
  template: `
    <ar-modal (close)="dismiss()">
      <p class="modal-title">Encaixar na aula</p>
      <p class="modal-sub">{{ session().className }} · {{ dateLabel(session().date) }} · {{ session().startTime }} · {{ spotsLeft() }} vaga{{ spotsLeft() === 1 ? '' : 's' }}</p>
      @if (error(); as err) {
        <div class="error-banner">{{ err }}</div>
      }
      <div class="ar-chart-tabs mode">
        <button type="button" [class.active]="tab() === 'makeup'" (click)="tab.set('makeup')">Reposição</button>
        <button type="button" [class.active]="tab() === 'trial'" (click)="tab.set('trial')">Experimental</button>
      </div>

      @if (tab() === 'makeup') {
        <div class="list">
          @if (loading()) {
            <p class="hint">Carregando créditos…</p>
          }
          @for (c of credits(); track c.id) {
            <button type="button" class="result" [class.active]="creditId() === c.id" (click)="creditId.set(c.id)">
              <span class="av">{{ initials(c.name) }}</span>
              <span class="grow">
                <span class="r-name">{{ c.name }}</span>
                <span class="r-sub">{{ c.reason === 'excused' ? 'Falta justificada' : 'Aula cancelada' }} em {{ short(c.sourceDate) }} · vence {{ short(c.expiresOn) }}</span>
              </span>
              @if (creditId() === c.id) {
                <span class="check">✓</span>
              }
            </button>
          } @empty {
            @if (!loading()) {
              <p class="hint">Nenhum aluno com crédito de reposição válido para esta data.</p>
            }
          }
        </div>
        <p class="hint">O crédito volta para o aluno se você tirar o encaixe antes de fechar a chamada.</p>
      } @else {
        <div class="chip-row spaced-top">
          <button type="button" class="ar-chip" [class.active]="mode() === 'athlete'" (click)="mode.set('athlete')">Atleta NexaGO</button>
          <button type="button" class="ar-chip" [class.active]="mode() === 'guest'" (click)="mode.set('guest')">Sem conta</button>
        </div>
        @if (mode() === 'athlete') {
          <div class="field-label spaced">Buscar atleta</div>
          <ar-aula-athlete-picker placeholder="Nome do atleta" emptyHint="Nenhum atleta encontrado. Use “Sem conta” para cadastrar só o nome." (selected)="picked.set($event)" />
        } @else {
          <div class="field-label spaced">Nome</div>
          <input class="input-box" type="text" maxlength="80" [value]="guestName()" (input)="guestName.set($any($event.target).value)" />
          <div class="field-label spaced">Telefone (opcional)</div>
          <input class="input-box" type="tel" maxlength="30" [value]="guestPhone()" (input)="guestPhone.set($any($event.target).value)" />
        }
        <p class="hint">A aula experimental não gera cobrança — depois dela, é só matricular.</p>
      }

      <div class="modal-actions">
        <button type="button" class="ar-mini-btn" [disabled]="busy()" (click)="dismiss()">Cancelar</button>
        <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="busy() || !canSubmit()" (click)="submit()">
          {{ busy() ? 'Encaixando…' : 'Encaixar' }}
        </button>
      </div>
    </ar-modal>
  `,
  styles: `
    .mode { margin-top: 4px; align-self: flex-start; display: inline-flex; }
    .spaced-top { margin-top: 14px; }
    .list { display: flex; flex-direction: column; gap: 6px; margin-top: 12px; max-height: 260px; overflow-y: auto; }
    .result {
      display: flex; align-items: center; gap: 10px; padding: 8px 10px; text-align: left; cursor: pointer;
      border-radius: var(--nx-r-2); background: var(--nx-surface-1); border: 1px solid var(--nx-line); color: var(--nx-text);
    }
    .result.active { background: var(--nx-orange-tint); border-color: rgba(255, 106, 26, 0.45); }
    .av {
      width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; flex: none;
      background: var(--nx-surface-2); font-family: var(--nx-font-display); font-weight: 700; font-size: 11px; color: var(--nx-text-mute);
    }
    .grow { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .r-name { font-family: var(--nx-font-display); font-weight: 600; font-size: 13px; }
    .r-sub { font-family: var(--nx-font-mono); font-size: 10px; color: var(--nx-text-dim); margin-top: 2px; }
    .check { color: var(--nx-orange-500); font-weight: 700; }
  `,
})
export class AulaExtraModalComponent {
  private readonly arenaContext = inject(ArenaContextService);

  readonly session = input.required<Pick<ClassSession, 'id' | 'className' | 'date' | 'startTime'>>();
  readonly spotsLeft = input.required<number>();
  /** Quem já está na chamada (alunos do dia e encaixes). */
  readonly rosterIds = input<readonly string[]>([]);
  readonly closed = output<void>();
  readonly added = output<string>();

  protected readonly dateLabel = weekdayDateLabel;
  protected readonly short = shortDate;
  protected readonly tab = signal<'makeup' | 'trial'>('makeup');
  protected readonly mode = signal<'athlete' | 'guest'>('athlete');
  protected readonly allCredits = signal<MakeupCredit[]>([]);
  protected readonly loading = signal(true);
  protected readonly creditId = signal<string | null>(null);
  protected readonly picked = signal<AthleteSearchResult | null>(null);
  protected readonly guestName = signal('');
  protected readonly guestPhone = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly credits = computed(() => usableCredits(this.allCredits(), this.session().date, new Set(this.rosterIds())));
  protected readonly canSubmit = computed(() => {
    if (this.tab() === 'makeup') return this.credits().some((c) => c.id === this.creditId());
    return this.mode() === 'athlete' ? this.picked() != null : this.guestName().trim().length >= 2;
  });

  constructor() {
    const arenaId = this.arenaContext.arenaId();
    if (!arenaId) {
      this.loading.set(false);
      return;
    }
    fetchAvailableCredits(arenaFirestore(), arenaId)
      .then((list) => this.allCredits.set(list))
      .catch(() => this.error.set('Não foi possível carregar os créditos.'))
      .finally(() => this.loading.set(false));
  }

  protected initials(name: string): string {
    const parts = name.trim().split(/\s+/);
    return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1]![0] ?? '' : '')).toUpperCase();
  }

  protected dismiss(): void {
    if (!this.busy()) this.closed.emit();
  }

  protected async submit(): Promise<void> {
    if (!this.canSubmit()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const sessionId = this.session().id;
      const input =
        this.tab() === 'makeup'
          ? { sessionId, kind: 'makeup' as const, creditId: this.creditId()! }
          : this.mode() === 'athlete'
            ? { sessionId, kind: 'trial' as const, athleteId: this.picked()!.id }
            : { sessionId, kind: 'trial' as const, name: this.guestName().trim(), phone: this.guestPhone().trim() || undefined };
      const result = await addExtra(arenaFunctions(), input);
      this.added.emit(result.studentId);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Não foi possível encaixar.');
    } finally {
      this.busy.set(false);
    }
  }
}
