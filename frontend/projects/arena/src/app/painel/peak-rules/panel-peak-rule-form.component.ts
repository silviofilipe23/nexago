import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { fetchCourts, type ArenaCourtDoc } from '@nexago/arena-discovery';
import { ArenaContextService } from '../data/arena-context.service';
import { arenaFirestore } from '../data/firestore';
import { ModalComponent } from '../ui/modal.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import {
  createPeakRule,
  deletePeakRule,
  fetchPeakRule,
  updatePeakRule,
  validatePeakRuleInput,
  type PeakRuleInput,
} from './peak-rules-repository';

const WEEKDAY_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: 'Seg' },
  { value: 2, label: 'Ter' },
  { value: 3, label: 'Qua' },
  { value: 4, label: 'Qui' },
  { value: 5, label: 'Sex' },
  { value: 6, label: 'Sáb' },
  { value: 7, label: 'Dom' },
];

const MIN_DURATION_OPTIONS = [
  { value: 120, label: '2 horas' },
  { value: 180, label: '3 horas' },
];

/** Tela Nova/Editar regra de horário de pico: CRUD real em
 *  `arenas/{arenaId}/peakRules`. Form pequeno, signals puros — sem lib de forms. */
@Component({
  selector: 'ar-panel-peak-rule-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelShellComponent, PageHeaderComponent, PanelCardComponent, ModalComponent],
  template: `
    <ar-panel-shell>
      <ar-page-header
        [title]="isEdit() ? 'Editar regra' : 'Nova regra de pico'"
        subtitle="Reserva mínima nos horários mais concorridos"
      />

      <div class="body">
        @if (loading()) {
          <p class="state-text">Carregando…</p>
        } @else {
          <ar-panel-card pad="lg">
            <div class="fields">
              <div class="field">
                <label class="field-label">Nome</label>
                <input
                  type="text"
                  class="input-box"
                  placeholder="Ex.: Pico noturno"
                  [value]="label()"
                  (input)="label.set($any($event.target).value)"
                />
              </div>

              <div class="field-row">
                <div class="field">
                  <label class="field-label">Início</label>
                  <input type="time" class="input-box" [value]="startTime()" (input)="startTime.set($any($event.target).value)" />
                </div>
                <div class="field">
                  <label class="field-label">Fim</label>
                  <input type="time" class="input-box" [value]="endTime()" (input)="endTime.set($any($event.target).value)" />
                </div>
              </div>

              <div class="field">
                <label class="field-label">Dias da semana</label>
                <p class="hint">Nenhum selecionado = todos os dias</p>
                <div class="ar-filter-bar">
                  @for (d of weekdayOptions; track d.value) {
                    <button type="button" class="ar-chip" [class.active]="weekdays().includes(d.value)" (click)="toggleWeekday(d.value)">
                      {{ d.label }}
                    </button>
                  }
                </div>
              </div>

              <div class="field">
                <label class="field-label">Quadras</label>
                <p class="hint">Nenhuma selecionada = todas as quadras</p>
                <div class="ar-filter-bar">
                  @for (c of courts(); track c.id) {
                    <button type="button" class="ar-chip" [class.active]="courtIds().includes(c.id)" (click)="toggleCourt(c.id)">
                      {{ c.name }}
                    </button>
                  } @empty {
                    <p class="hint">Nenhuma quadra cadastrada ainda.</p>
                  }
                </div>
              </div>

              <div class="field">
                <label class="field-label">Reserva mínima</label>
                <select class="input-box" [value]="minDurationMinutes()" (change)="minDurationMinutes.set(+$any($event.target).value)">
                  @for (o of minDurationOptions; track o.value) {
                    <option [value]="o.value">{{ o.label }}</option>
                  }
                </select>
              </div>

              <div class="field">
                <label class="checkbox-label">
                  <input type="checkbox" [checked]="releaseEnabled()" (change)="releaseEnabled.set($any($event.target).checked)" />
                  Liberar automaticamente perto do horário
                </label>
                @if (releaseEnabled()) {
                  <div class="release-row">
                    <input
                      type="number"
                      min="1"
                      max="48"
                      class="input-box input-number"
                      [value]="releaseHoursBefore()"
                      (input)="releaseHoursBefore.set($any($event.target).valueAsNumber || 1)"
                    />
                    <span class="suffix">horas antes do horário</span>
                  </div>
                }
                <p class="hint">Perto do horário, a exigência cai e o slot volta à venda avulsa</p>
              </div>

              <div class="field">
                <label class="checkbox-label">
                  <input type="checkbox" [checked]="active()" (change)="active.set($any($event.target).checked)" />
                  Regra ativa
                </label>
              </div>
            </div>

            @if (error(); as err) {
              <p class="form-error">{{ err }}</p>
            }

            <div class="actions-row">
              <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="saving()" (click)="save()">
                {{ saving() ? 'Salvando…' : 'Salvar' }}
              </button>
              <button type="button" class="ar-ghost-btn" [disabled]="saving()" (click)="cancel()">Cancelar</button>
              @if (isEdit()) {
                <button type="button" class="ar-ghost-btn danger-link" [disabled]="saving()" (click)="showRemoveConfirm.set(true)">Excluir</button>
              }
            </div>
          </ar-panel-card>
        }
      </div>

      @if (showRemoveConfirm()) {
        <ar-modal (close)="showRemoveConfirm.set(false)">
          <h2 class="confirm-title">Excluir regra?</h2>
          <p class="confirm-body">"{{ label() }}" será excluída e deixa de valer imediatamente.</p>
          <div class="confirm-actions">
            <button type="button" class="ar-ghost-btn" [disabled]="saving()" (click)="showRemoveConfirm.set(false)">Cancelar</button>
            <button type="button" class="ar-mini-btn danger-btn" [disabled]="saving()" (click)="remove()">
              {{ saving() ? 'Excluindo…' : 'Excluir' }}
            </button>
          </div>
        </ar-modal>
      }
    </ar-panel-shell>
  `,
  styles: `
    .body {
      flex: 1;
      padding: 22px 32px 28px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      overflow: auto;
      max-width: 640px;
    }

    .state-text {
      font-size: 13.5px;
      color: var(--nx-text-mute);
    }

    .fields {
      display: flex;
      flex-direction: column;
      gap: 18px;
    }

    .field {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .field-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }

    .field-label {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }

    .hint {
      font-size: 12px;
      color: var(--nx-text-dim);
      margin: 0;
    }

    .input-box {
      width: 100%;
      height: 46px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      color: var(--nx-text);
      font-family: var(--nx-font-ui);
      font-size: 14px;
      padding: 0 14px;
      box-sizing: border-box;
    }

    .input-box:focus {
      outline: none;
      border-color: var(--nx-orange-500);
    }

    .input-number {
      width: 120px;
    }

    .checkbox-label {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13.5px;
      color: var(--nx-text);
      cursor: pointer;
    }

    .release-row {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .suffix {
      font-size: 12.5px;
      color: var(--nx-text-mute);
    }

    .form-error {
      border-radius: var(--nx-r-2);
      border: 1px solid var(--nx-live);
      background: rgba(255, 59, 48, 0.08);
      color: var(--nx-live);
      padding: 10px 14px;
      font-size: 12.5px;
      margin: 18px 0 0;
    }

    .actions-row {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-top: 22px;
    }

    .danger-link {
      color: var(--nx-live);
      margin-left: auto;
    }

    .confirm-title {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 19px;
      color: var(--nx-text);
      margin: 0 0 10px;
    }

    .confirm-body {
      font-size: 13.5px;
      line-height: 1.55;
      color: var(--nx-text-mute);
      margin: 0 0 22px;
    }

    .confirm-actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 16px;
    }

    .danger-btn {
      height: 44px;
      padding: 0 20px;
      background: var(--nx-live);
      color: #fff;
      border: none;
    }

    .danger-btn:hover:not(:disabled) {
      background: #ff564c;
    }

    @media (max-width: 720px) {
      .field-row {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class PanelPeakRuleFormComponent {
  private readonly arenaContext = inject(ArenaContextService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly weekdayOptions = WEEKDAY_OPTIONS;
  protected readonly minDurationOptions = MIN_DURATION_OPTIONS;

  protected readonly ruleId = computed(() => this.route.snapshot.paramMap.get('id'));
  protected readonly isEdit = computed(() => this.ruleId() != null);

  protected readonly label = signal('');
  protected readonly active = signal(true);
  protected readonly courtIds = signal<string[]>([]);
  protected readonly weekdays = signal<number[]>([]);
  protected readonly startTime = signal('20:00');
  protected readonly endTime = signal('21:00');
  protected readonly minDurationMinutes = signal(120);
  protected readonly releaseEnabled = signal(false);
  protected readonly releaseHoursBefore = signal(3);

  protected readonly courts = signal<ArenaCourtDoc[]>([]);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly loading = signal(true);
  protected readonly showRemoveConfirm = signal(false);

  constructor() {
    effect(() => {
      const arenaId = this.arenaContext.arenaId();
      if (!arenaId) return;
      void this.load(arenaId);
    });
  }

  private async load(arenaId: string): Promise<void> {
    this.loading.set(true);
    try {
      this.courts.set(await fetchCourts(arenaFirestore(), arenaId));
      const id = this.ruleId();
      if (id) {
        const rule = await fetchPeakRule(arenaFirestore(), arenaId, id);
        if (rule) {
          this.label.set(rule.label);
          this.active.set(rule.active);
          this.courtIds.set(rule.courtIds);
          this.weekdays.set(rule.weekdays);
          this.startTime.set(rule.startTime);
          this.endTime.set(rule.endTime);
          this.minDurationMinutes.set(rule.minDurationMinutes);
          this.releaseEnabled.set(rule.releaseHoursBefore != null);
          this.releaseHoursBefore.set(rule.releaseHoursBefore ?? 3);
        }
      }
    } finally {
      this.loading.set(false);
    }
  }

  protected toggleCourt(id: string): void {
    this.courtIds.update((ids) => (ids.includes(id) ? ids.filter((c) => c !== id) : [...ids, id]));
  }

  protected toggleWeekday(value: number): void {
    this.weekdays.update((ds) => (ds.includes(value) ? ds.filter((d) => d !== value) : [...ds, value]));
  }

  private buildInput(): PeakRuleInput {
    return {
      label: this.label(),
      active: this.active(),
      courtIds: this.courtIds(),
      weekdays: this.weekdays(),
      startTime: this.startTime(),
      endTime: this.endTime(),
      minDurationMinutes: this.minDurationMinutes(),
      releaseHoursBefore: this.releaseEnabled() ? this.releaseHoursBefore() : null,
    };
  }

  protected async save(): Promise<void> {
    const arenaId = this.arenaContext.arenaId();
    if (!arenaId || this.saving()) return;
    const input = this.buildInput();
    const validationError = validatePeakRuleInput(input);
    if (validationError) {
      this.error.set(validationError);
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    try {
      const id = this.ruleId();
      if (id) {
        await updatePeakRule(arenaFirestore(), arenaId, id, input);
      } else {
        await createPeakRule(arenaFirestore(), arenaId, input);
      }
      this.router.navigate(['/painel/horarios-pico']);
    } catch {
      this.error.set('Não foi possível salvar a regra. Verifique seu plano e tente novamente.');
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove(): Promise<void> {
    const arenaId = this.arenaContext.arenaId();
    const id = this.ruleId();
    if (!arenaId || !id || this.saving()) return;
    this.saving.set(true);
    try {
      await deletePeakRule(arenaFirestore(), arenaId, id);
      this.showRemoveConfirm.set(false);
      this.router.navigate(['/painel/horarios-pico']);
    } catch {
      this.showRemoveConfirm.set(false);
      this.error.set('Não foi possível excluir a regra. Tente novamente.');
    } finally {
      this.saving.set(false);
    }
  }

  protected cancel(): void {
    this.router.navigate(['/painel/horarios-pico']);
  }
}
