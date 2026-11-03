import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { ArenaContextService } from '../data/arena-context.service';
import { arenaFunctions } from '../data/functions';
import { ModalComponent } from '../ui/modal.component';
import { ToggleComponent } from '../ui/toggle.component';
import { minutesOf } from '../aulas/class.model';
import { ONLINE_BILLING_FEE_TEXT } from './schedule-plan.logic';
import { WEEKDAYS, WEEKDAY_SHORT, type ScheduleSettings } from './schedule-plan.model';
import { saveScheduleRules } from './schedule-plan-repository';

/** "Regras gerais" dos planos: janela do horário nobre + limite para planos, a oferta
 *  automática da lista de espera e a cobrança online das mensalidades (`saveArenaScheduleRules`). */
@Component({
  selector: 'ar-ph-rules-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ModalComponent, ToggleComponent],
  styleUrl: './planos-horario.scss',
  template: `
    <ar-modal size="lg" (close)="close.emit()">
      <p class="modal-title">Regras gerais</p>
      <p class="modal-sub">Valem para todos os planos de horário da arena.</p>
      @if (error(); as err) {
        <div class="error-banner">{{ err }}</div>
      }

      <div class="field-label">Horário nobre · dias</div>
      <div class="chip-row">
        @for (d of weekdays; track d) {
          <button type="button" class="sm-chip" [class.active]="primeDays().includes(d)" (click)="toggleDay(d)">{{ dayShort[d] }}</button>
        }
      </div>
      <div class="row-2">
        <div>
          <div class="field-label spaced">Começa</div>
          <input class="input-box" type="time" step="1800" [value]="primeStart()" (input)="primeStart.set($any($event.target).value)" />
        </div>
        <div>
          <div class="field-label spaced">Termina</div>
          <input class="input-box" type="time" step="1800" [value]="primeEnd()" (input)="primeEnd.set($any($event.target).value)" />
        </div>
      </div>

      <div class="field-label spaced">Limite do nobre para planos</div>
      <div class="chip-row">
        @for (p of capPresets; track p) {
          <button type="button" class="sm-chip" [class.active]="cap() === p" (click)="cap.set(p)">{{ p }}%</button>
        }
        <input class="input-box cap-input" type="number" min="0" max="100" aria-label="Limite em %" [value]="cap()" (input)="cap.set(+$any($event.target).value)" />
      </div>
      <p class="hint">No máximo {{ cap() }}% das horas-quadra do nobre vão para fixos de plano. O resto fica sempre para reserva avulsa.</p>

      <div class="toggle-row">
        <div>
          <div class="toggle-title">Oferecer vaga sozinho</div>
          <div class="hint flush">Quando um horário abre, o 1º da lista de espera recebe a oferta sem você aprovar.</div>
        </div>
        <ar-toggle [checked]="autoOffer()" label="Oferecer vaga sozinho" (changed)="autoOffer.set($event)" />
      </div>
      <div class="field-label spaced">Prazo para responder a oferta</div>
      <div class="chip-row">
        @for (h of offerHours; track h) {
          <button type="button" class="sm-chip" [class.active]="hours() === h" (click)="hours.set(h)">{{ h }}h</button>
        }
      </div>

      <div class="toggle-row">
        <div>
          <div class="toggle-title">Cobrança online (Pix ou cartão)</div>
          <div class="hint flush">Nas assinaturas com Pix ou cartão, cada mensalidade vira um link que o atleta paga pelo app. "Na arena" segue com baixa manual.</div>
        </div>
        <ar-toggle [checked]="onlineBilling()" label="Cobrança online (Pix ou cartão)" (changed)="onlineBilling.set($event)" />
      </div>
      <p class="hint">{{ feeText }} Precisa do pagamento online ativo e da chave PIX de repasse no perfil da arena.</p>

      <div class="modal-actions">
        <button type="button" class="ar-mini-btn" [disabled]="saving()" (click)="close.emit()">Cancelar</button>
        <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="saving() || !valid()" (click)="save()">
          {{ saving() ? 'Salvando…' : 'Salvar regras' }}
        </button>
      </div>
    </ar-modal>
  `,
  styles: `
    .cap-input { width: 76px; height: 26px; font-family: var(--nx-font-mono); font-size: 12px; }
    .toggle-row { display: flex; align-items: center; gap: 14px; margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--nx-line); }
    .toggle-row > div { flex: 1; min-width: 0; }
    .toggle-title { font-family: var(--nx-font-display); font-weight: 700; font-size: 13px; color: var(--nx-text); }
    .flush { margin-top: 3px; }
  `,
})
export class PhRulesModalComponent implements OnInit {
  private readonly arenaContext = inject(ArenaContextService);

  readonly settings = input.required<ScheduleSettings>();
  readonly close = output<void>();
  readonly saved = output<void>();

  protected readonly weekdays = WEEKDAYS;
  protected readonly dayShort = WEEKDAY_SHORT;
  protected readonly capPresets = [50, 60, 75, 90];
  protected readonly offerHours = [12, 24, 48] as const;

  protected readonly primeDays = signal<number[]>([]);
  protected readonly primeStart = signal('18:00');
  protected readonly primeEnd = signal('23:00');
  protected readonly cap = signal(75);
  protected readonly autoOffer = signal(true);
  protected readonly hours = signal<12 | 24 | 48>(24);
  protected readonly onlineBilling = signal(false);
  protected readonly feeText = ONLINE_BILLING_FEE_TEXT;
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly valid = computed(
    () =>
      this.primeDays().length > 0 &&
      minutesOf(this.primeEnd()) > minutesOf(this.primeStart()) &&
      this.cap() >= 0 &&
      this.cap() <= 100,
  );

  ngOnInit(): void {
    const s = this.settings();
    const first = s.primeWindows[0];
    this.primeDays.set([...new Set(s.primeWindows.map((w) => w.weekday))].sort((a, b) => a - b));
    if (first) {
      this.primeStart.set(first.startTime);
      this.primeEnd.set(first.endTime);
    }
    this.cap.set(s.primeCapPercent);
    this.autoOffer.set(s.waitlistAutoOffer);
    this.hours.set(s.waitlistOfferHours);
    this.onlineBilling.set(s.onlineBillingEnabled);
  }

  protected toggleDay(d: number): void {
    this.primeDays.update((days) => (days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort((a, b) => a - b)));
  }

  protected async save(): Promise<void> {
    const arenaId = this.arenaContext.arenaId();
    if (!arenaId || !this.valid()) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      await saveScheduleRules(arenaFunctions(), {
        arenaId,
        primeWindows: this.primeDays().map((weekday) => ({ weekday, startTime: this.primeStart(), endTime: this.primeEnd() })),
        primeCapPercent: Math.round(this.cap()),
        waitlistAutoOffer: this.autoOffer(),
        waitlistOfferHours: this.hours(),
        // Só manda quando mudou: ligar revalida pagamento online + chave PIX no servidor.
        ...(this.onlineBilling() !== this.settings().onlineBillingEnabled ? { onlineBillingEnabled: this.onlineBilling() } : {}),
      });
      this.saved.emit();
      this.close.emit();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Não foi possível salvar as regras.');
    } finally {
      this.saving.set(false);
    }
  }
}
