import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
  type OnInit,
} from '@angular/core';
import {
  ATHLETE_SPORT_CODES,
  LEVEL_OPTIONS,
  athleteSportLabel,
  levelDisplayLabel,
  levelRankOf,
} from '@nexago/levels';
import { callableErrorMessage } from '../data/callable-error';
import type { BackofficeUser } from '../organizadores/data/organizers.repository';
import { userDisplayName } from '../organizadores/role-subject';
import { ConfirmDialogComponent } from '../ui/confirm-dialog.component';
import { FieldComponent } from '../ui/field.component';
import { IconComponent } from '../ui/icon.component';
import { PillComponent } from '../ui/pill.component';
import {
  AthletesRepository,
  type AthleteLevelChange,
  type AthleteLevelHistoryEntry,
  type AthleteSportLevel,
} from './data/athletes.repository';

type LoadState = 'loading' | 'ok' | 'error';

/** Mesmos limites do callable `setAthleteLevel`. */
const REASON_MIN = 10;
const REASON_MAX = 500;

const HISTORY_REASON_LABELS: Record<string, string> = {
  admin_manual: 'Ajuste manual',
  self_upgrade: 'Subiu pelo app',
  promotion: 'Promoção da escada',
  relegation: 'Rebaixamento da escada',
  migration: 'Migração de nível',
};

/**
 * Correção do nível declarado de um atleta pelo backoffice.
 *
 * Só existe aqui porque as rules e a UI do app/portal só deixam SUBIR: o caso
 * de uso — nível que não condiz com a realidade — é quase sempre um
 * rebaixamento, que exige Admin SDK. O motivo é interno (fica na auditoria, não
 * vai na notificação do atleta).
 */
@Component({
  selector: 'bo-athlete-level-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ConfirmDialogComponent, FieldComponent, IconComponent, PillComponent],
  template: `
    <bo-confirm-dialog
      [open]="true"
      size="md"
      title="Trocar nível do atleta"
      [description]="description()"
      confirmLabel="Aplicar nível"
      [tone]="isDowngrade() ? 'danger' : 'primary'"
      [busy]="submitting()"
      [confirmDisabled]="state() !== 'ok' || !canSubmit()"
      [error]="submitError()"
      (confirmed)="submit()"
      (dismissed)="close()"
    >
      @switch (state()) {
        @case ('loading') {
          <p class="status">Carregando níveis…</p>
        }
        @case ('error') {
          <div class="bo-alert">
            <bo-icon name="alert" [size]="16" />
            <span>{{ errorMessage() }}</span>
          </div>
          <button type="button" class="bo-mini-btn self-start" (click)="load()">
            Tentar de novo
          </button>
        }
        @default {
          <section class="declared">
            <h3>Níveis declarados</h3>
            @for (sport of sports(); track sport.sportCode) {
              <div class="declared-row">
                <span class="sport">
                  {{ sportLabel(sport.sportCode) }}
                  @if (sport.sportCode === primarySportId()) {
                    <span class="tag">principal</span>
                  }
                </span>
                <bo-pill tone="dim">{{ sport.label || sport.level }}</bo-pill>
              </div>
            } @empty {
              <p class="status">Este atleta ainda não declarou nível em nenhum esporte.</p>
            }
          </section>

          <!-- A seleção vai por [selected] na option, não por [value] no select:
               o binding do select roda antes das options existirem e o navegador
               cairia sempre na primeira. -->
          <bo-field label="Esporte">
            <select class="bo-input" (change)="pickSport(value($event))">
              @for (sport of sportChoices(); track sport.code) {
                <option [value]="sport.code" [selected]="sport.code === sportCode()">
                  {{ sport.label }}
                </option>
              }
            </select>
          </bo-field>

          <bo-field label="Novo nível" [hint]="levelHint()">
            <select class="bo-input" (change)="level.set(value($event))">
              @for (option of levelOptions; track option.code) {
                <option [value]="option.code" [selected]="option.code === level()">
                  {{ option.label }}
                </option>
              }
            </select>
          </bo-field>

          @if (isDowngrade()) {
            <div class="bo-alert warn">
              <bo-icon name="alert" [size]="16" />
              <span>
                Rebaixamento — nem o app nem as regras do banco permitem isso; só o backoffice.
                O atleta não consegue desfazer.
              </span>
            </div>
          }

          <bo-field label="Motivo" [hint]="reasonHint()">
            <textarea
              class="bo-input reason"
              rows="3"
              placeholder="Ex.: joga em nível open há 3 torneios, nível declarado não condiz"
              [value]="reason()"
              (input)="reason.set(value($event))"
            ></textarea>
          </bo-field>

          @if (history().length > 0) {
            <section class="history">
              <h3>Mudanças recentes</h3>
              @for (entry of history(); track entry.id) {
                <div class="history-row">
                  <span class="history-when">{{ formatDate(entry.createdAtMs) }}</span>
                  <span class="history-what">
                    {{ sportLabel(entry.sportCode) }}:
                    {{ levelLabel(entry.fromLevel) || '—' }} → {{ levelLabel(entry.toLevel) }}
                  </span>
                  <span class="history-who">{{ historyReason(entry) }}</span>
                </div>
              }
            </section>
          }
        }
      }
    </bo-confirm-dialog>
  `,
  styles: `
    h3 {
      margin: 0 0 2px;
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }

    .status {
      margin: 0;
      font-size: 12.5px;
      color: var(--nx-text-dim);
    }

    .self-start {
      align-self: flex-start;
    }

    .declared,
    .history {
      display: flex;
      flex-direction: column;
      gap: 7px;
      padding: 12px 14px;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-3);
    }

    .declared-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }

    .sport {
      display: flex;
      align-items: center;
      gap: 7px;
      font-size: 13px;
      color: var(--nx-text);
    }

    .tag {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--nx-orange-500);
    }

    .reason {
      resize: vertical;
      min-height: 68px;
      font-family: var(--nx-font-ui);
      line-height: 1.45;
    }

    .bo-alert.warn {
      background: rgba(244, 197, 67, 0.1);
      border-color: rgba(244, 197, 67, 0.32);
      color: var(--nx-pending);
    }

    .history-row {
      display: grid;
      grid-template-columns: 74px 1fr auto;
      gap: 10px;
      align-items: baseline;
      font-size: 12px;
      color: var(--nx-text-mute);
    }

    .history-when,
    .history-who {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      color: var(--nx-text-dim);
    }

    .history-what {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `,
})
export class AthleteLevelDialogComponent implements OnInit {
  private readonly repository = inject(AthletesRepository);

  readonly user = input.required<BackofficeUser>();

  readonly dismissed = output<void>();
  readonly changed = output<AthleteLevelChange>();

  protected readonly levelOptions = LEVEL_OPTIONS;
  protected readonly sportLabel = athleteSportLabel;

  protected readonly state = signal<LoadState>('loading');
  protected readonly errorMessage = signal('');
  protected readonly sports = signal<readonly AthleteSportLevel[]>([]);
  protected readonly primarySportId = signal<string | null>(null);
  protected readonly history = signal<readonly AthleteLevelHistoryEntry[]>([]);

  protected readonly sportCode = signal('');
  protected readonly level = signal('');
  protected readonly reason = signal('');
  protected readonly submitting = signal(false);
  protected readonly submitError = signal<string | null>(null);

  /** `ngOnInit` e não o construtor: input obrigatório ainda não está resolvido lá. */
  ngOnInit(): void {
    void this.load();
  }

  protected readonly description = computed(
    () =>
      `${userDisplayName(this.user())} — a troca vale na hora para elegibilidade de ` +
      'categoria e realinha o rating do esporte, quando ele tem escada.',
  );

  /** Declarados primeiro (com o nível no rótulo), o resto depois. */
  protected readonly sportChoices = computed(() => {
    const declared = this.sports();
    const declaredCodes = new Set(declared.map((s) => s.sportCode));
    return [
      ...declared.map((sport) => ({
        code: sport.sportCode,
        label: `${athleteSportLabel(sport.sportCode)} — ${sport.label || sport.level}`,
      })),
      ...ATHLETE_SPORT_CODES.filter((code) => !declaredCodes.has(code)).map((code) => ({
        code,
        label: `${athleteSportLabel(code)} — sem nível`,
      })),
    ];
  });

  private readonly currentLevel = computed(
    () => this.sports().find((sport) => sport.sportCode === this.sportCode())?.level ?? null,
  );

  protected readonly isDowngrade = computed(() => {
    const from = levelRankOf(this.currentLevel());
    const to = levelRankOf(this.level());
    return from != null && to != null && to < from;
  });

  private readonly isSameLevel = computed(
    () => this.currentLevel() != null && levelRankOf(this.currentLevel()) === levelRankOf(this.level()),
  );

  protected readonly levelHint = computed(() => {
    const sport = this.sports().find((s) => s.sportCode === this.sportCode());
    if (this.isSameLevel()) {
      return 'O atleta já está neste nível.';
    }
    return sport?.rated ?
      'Esporte com escada: o rating é puxado para a faixa do nível novo.' :
      'Esporte sem escada de rating — só o nível declarado muda.';
  });

  protected readonly reasonHint = computed(() => {
    const length = this.reason().trim().length;
    if (length === 0) {
      return `Obrigatório, de ${REASON_MIN} a ${REASON_MAX} caracteres. Fica na auditoria, o atleta não vê.`;
    }
    if (length < REASON_MIN) {
      return `Faltam ${REASON_MIN - length} caracteres.`;
    }
    return `${length}/${REASON_MAX} caracteres.`;
  });

  protected readonly canSubmit = computed(() => {
    const length = this.reason().trim().length;
    return (
      this.sportCode().length > 0 &&
      this.level().length > 0 &&
      !this.isSameLevel() &&
      length >= REASON_MIN &&
      length <= REASON_MAX
    );
  });

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      const state = await this.repository.levelState(this.user().uid);
      this.sports.set(state.sports);
      this.primarySportId.set(state.primarySportId);
      this.history.set(state.history);

      // Alvo padrão: o esporte principal; sem ele, o primeiro declarado.
      const initial =
        state.sports.find((sport) => sport.sportCode === state.primarySportId)?.sportCode ??
        state.sports[0]?.sportCode ??
        ATHLETE_SPORT_CODES[0]!;
      this.pickSport(initial);
      this.state.set('ok');
    } catch (err) {
      this.errorMessage.set(callableErrorMessage(err));
      this.state.set('error');
    }
  }

  /** Trocar de esporte reposiciona o nível no atual daquele esporte. */
  protected pickSport(code: string): void {
    this.sportCode.set(code);
    const current = this.sports().find((sport) => sport.sportCode === code)?.level ?? null;
    const rank = levelRankOf(current);
    const match = rank == null ? null : LEVEL_OPTIONS.find((o) => levelRankOf(o.code) === rank);
    this.level.set(match?.code ?? LEVEL_OPTIONS[0]!.code);
  }

  protected async submit(): Promise<void> {
    if (!this.canSubmit() || this.submitting()) {
      return;
    }
    this.submitting.set(true);
    this.submitError.set(null);
    try {
      const change = await this.repository.setLevel(
        this.user().uid,
        this.sportCode(),
        this.level(),
        this.reason().trim(),
      );
      this.changed.emit(change);
    } catch (err) {
      this.submitError.set(callableErrorMessage(err));
    } finally {
      this.submitting.set(false);
    }
  }

  protected close(): void {
    if (this.submitting()) {
      return;
    }
    this.dismissed.emit();
  }

  protected levelLabel(raw: string | null): string {
    return levelDisplayLabel(raw);
  }

  protected historyReason(entry: AthleteLevelHistoryEntry): string {
    const label = entry.reason ? (HISTORY_REASON_LABELS[entry.reason] ?? entry.reason) : '—';
    return entry.actorLabel ? `${label} · ${entry.actorLabel}` : label;
  }

  protected formatDate(ms: number | null): string {
    return ms == null ? '—' : new Date(ms).toLocaleDateString('pt-BR');
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value;
  }
}
