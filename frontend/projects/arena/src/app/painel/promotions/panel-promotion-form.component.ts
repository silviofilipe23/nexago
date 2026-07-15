import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ArenaContextService } from '../data/arena-context.service';
import { arenaFirestore } from '../data/firestore';
import { fetchCourtsList } from '../courts/courts-repository';
import type { ArenaCourt } from '../courts/court.model';
import { IconComponent } from '../ui/icon.component';
import { ModalComponent } from '../ui/modal.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { ToggleComponent } from '../ui/toggle.component';
import { dateToInputValue, inputValueToDate, PROMO_WEEKDAYS, PROMO_WEEKDAY_LABEL } from './promotion.model';
import { createPromotion, deletePromotion, fetchAllPromotions, updatePromotion } from './promotions-repository';

type DiscountKind = 'percent' | 'fixed';

function parseNumber(raw: string): number {
  return Number(raw.replace(',', '.')) || 0;
}

/** Tela Nova/Editar promoção: CRUD real em `arenas/{arenaId}/promotions`. Sem "limite de
 *  usos" — não existe contagem de resgate no backend. Alvo é por quadra específica (real),
 *  não por esporte (não existe essa opção no schema). Dias são ISO 1-7 (seg-dom); nenhum
 *  selecionado = vale todos os dias. */
@Component({
  selector: 'ar-panel-promotion-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelShellComponent, PageHeaderComponent, PanelCardComponent, IconComponent, ToggleComponent, ModalComponent],
  template: `
    <ar-panel-shell>
      <ar-page-header [title]="headerTitle()" subtitle="Desconto automático em dias e horários definidos">
        <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="!canSave() || saving()" (click)="save()">
          <ar-icon name="check" [size]="14" />
          {{ saving() ? 'Salvando…' : 'Salvar promoção' }}
        </button>
      </ar-page-header>

      <div class="body">
        @if (loading()) {
          <p class="state-text">Carregando…</p>
        } @else {
          <div class="col-left">
            @if (errorMessage(); as err) {
              <div class="error-banner">{{ err }}</div>
            }

            <ar-panel-card title="Informações básicas">
              <div class="field-label">Nome da promoção</div>
              <input
                type="text"
                class="input-box name-input"
                placeholder="Ex.: Happy Hour da Tarde"
                [value]="label()"
                (input)="label.set($any($event.target).value)"
              />

              <div class="field-label">Ativa</div>
              <ar-toggle [checked]="active()" (changed)="active.set($event)" />
            </ar-panel-card>

            <ar-panel-card title="Quadras aplicáveis">
              <div class="ar-filter-bar filter-block">
                <button type="button" class="ar-chip" [class.active]="allCourts()" (click)="setAllCourts(true)">Todas as quadras</button>
                <button type="button" class="ar-chip" [class.active]="!allCourts()" (click)="setAllCourts(false)">Quadras específicas</button>
              </div>
              @if (!allCourts()) {
                <div class="ar-filter-bar">
                  @for (c of courts(); track c.id) {
                    <button type="button" class="ar-chip" [class.active]="selectedCourtIds().includes(c.id)" (click)="toggleCourt(c.id)">
                      {{ c.name }}
                    </button>
                  } @empty {
                    <p class="hint">Nenhuma quadra cadastrada ainda.</p>
                  }
                </div>
              }
            </ar-panel-card>

            <ar-panel-card title="Quando aplicar">
              <div class="field-label">Dias da semana</div>
              <p class="hint">Nenhum dia selecionado = vale todos os dias.</p>
              <div class="ar-filter-bar filter-block">
                @for (d of weekdayOptions; track d) {
                  <button type="button" class="ar-chip" [class.active]="weekdays().includes(d)" (click)="toggleWeekday(d)">{{ weekdayLabel[d] }}</button>
                }
              </div>

              <div class="row-2">
                <div>
                  <div class="field-label">Horário inicial</div>
                  <input type="time" class="input-box" [value]="startTime()" (input)="startTime.set($any($event.target).value)" />
                </div>
                <div>
                  <div class="field-label">Horário final</div>
                  <input type="time" class="input-box" [value]="endTime()" (input)="endTime.set($any($event.target).value)" />
                </div>
              </div>

              <div class="row-2 row-gap">
                <div>
                  <div class="field-label">Início da vigência (opcional)</div>
                  <input type="date" class="input-box" [value]="validFrom()" (input)="validFrom.set($any($event.target).value)" />
                </div>
                <div>
                  <div class="field-label">Fim da vigência (opcional)</div>
                  <input type="date" class="input-box" [value]="validUntil()" (input)="validUntil.set($any($event.target).value)" />
                </div>
              </div>
            </ar-panel-card>

            <ar-panel-card title="Desconto">
              <div class="type-toggle">
                <button type="button" class="type-btn" [class.active]="discountKind() === 'percent'" (click)="discountKind.set('percent')">% Percentual</button>
                <button type="button" class="type-btn" [class.active]="discountKind() === 'fixed'" (click)="discountKind.set('fixed')">R$ Valor fixo/h</button>
              </div>

              <div class="field-label">{{ discountKind() === 'percent' ? 'Desconto (%)' : 'Preço fixo por hora (R$)' }}</div>
              <input type="text" inputmode="decimal" class="input-box" [value]="discountValue()" (input)="discountValue.set($any($event.target).value)" />
            </ar-panel-card>

            @if (isEdit()) {
              <button type="button" class="remove-link" (click)="showRemoveConfirm.set(true)">
                <ar-icon name="alert-triangle" [size]="14" />
                Remover promoção
              </button>
            }
          </div>

          <div class="col-right">
            <ar-panel-card title="Resumo">
              <div class="resumo-name">{{ label() || 'Nome da promoção' }}</div>
              <div class="resumo-meta">{{ allCourts() ? 'Todas as quadras' : selectedCourtIds().length + ' quadra(s)' }}</div>
              <div class="resumo-highlight">
                <div class="field-label tone-orange">Desconto aplicado</div>
                <div class="resumo-value">{{ discountKind() === 'percent' ? discountValue() + '%' : 'R$ ' + discountValue() + '/h' }}</div>
                <div class="resumo-time">{{ startTime() }}-{{ endTime() }}</div>
              </div>
            </ar-panel-card>

            <div class="hint-box">O desconto aparece automaticamente pro cliente ao escolher um horário elegível — sem necessidade de cupom.</div>
          </div>
        }
      </div>

      @if (showRemoveConfirm()) {
        <ar-modal (close)="showRemoveConfirm.set(false)">
          <h2 class="confirm-title">Remover promoção?</h2>
          <p class="confirm-body">"{{ label() }}" será removida e deixa de aparecer pros clientes imediatamente.</p>
          <div class="confirm-actions">
            <button type="button" class="ar-ghost-btn" [disabled]="removing()" (click)="showRemoveConfirm.set(false)">Cancelar</button>
            <button type="button" class="ar-mini-btn danger-btn" [disabled]="removing()" (click)="remove()">
              {{ removing() ? 'Removendo…' : 'Remover promoção' }}
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
      display: grid;
      grid-template-columns: 1fr 373px;
      gap: 16px;
      align-items: start;
      overflow: auto;
    }

    .state-text {
      font-size: 13.5px;
      color: var(--nx-text-mute);
    }

    .error-banner {
      border-radius: var(--nx-r-2);
      border: 1px solid var(--nx-live);
      background: rgba(255, 59, 48, 0.08);
      color: var(--nx-live);
      padding: 10px 14px;
      font-size: 12.5px;
    }

    .col-left,
    .col-right {
      display: flex;
      flex-direction: column;
      gap: 16px;
      min-width: 0;
    }

    .field-label {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      margin-bottom: 10px;
    }

    .field-label.tone-orange {
      color: var(--nx-orange-500);
    }

    .hint {
      font-size: 12px;
      color: var(--nx-text-dim);
      margin: 0 0 12px;
    }

    .filter-block {
      margin-bottom: 18px;
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

    .name-input {
      margin-bottom: 18px;
    }

    .row-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }

    .row-gap {
      margin-top: 18px;
    }

    .type-toggle {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin-bottom: 18px;
    }

    .type-btn {
      height: 52px;
      border-radius: var(--nx-r-3);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      color: var(--nx-text-mute);
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 14px;
      cursor: pointer;
      transition: all 140ms var(--nx-ease-out);
    }

    .type-btn:hover {
      background: var(--nx-surface-2);
    }

    .type-btn.active {
      background: var(--nx-orange-tint);
      border-color: var(--nx-orange-500);
      color: var(--nx-orange-500);
    }

    .resumo-name {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 16px;
      color: var(--nx-text);
    }

    .resumo-meta {
      font-size: 12.5px;
      color: var(--nx-text-dim);
      margin-top: 4px;
      margin-bottom: 16px;
    }

    .resumo-highlight {
      padding: 16px;
      border-radius: var(--nx-r-3);
      background: var(--nx-orange-tint);
      border: 1px solid rgba(255, 106, 26, 0.3);
    }

    .resumo-value {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 28px;
      letter-spacing: -0.02em;
      color: var(--nx-orange-500);
      margin-top: 4px;
    }

    .resumo-time {
      font-family: var(--nx-font-mono);
      font-size: 12px;
      color: var(--nx-text-dim);
      margin-top: 4px;
    }

    .hint-box {
      padding: 14px 16px;
      border-radius: var(--nx-r-3);
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      font-size: 12.5px;
      line-height: 1.55;
      color: var(--nx-text-dim);
    }

    .remove-link {
      align-self: flex-start;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: transparent;
      border: none;
      cursor: pointer;
      padding: 4px 0;
      color: var(--nx-live);
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13px;
    }

    .remove-link:hover {
      text-decoration: underline;
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

    @media (max-width: 1180px) {
      .body {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 720px) {
      .row-2 {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class PanelPromotionFormComponent {
  private readonly arenaContext = inject(ArenaContextService);
  private readonly router = inject(Router);

  readonly id = input<string | null>(null);

  protected readonly weekdayOptions = PROMO_WEEKDAYS;
  protected readonly weekdayLabel = PROMO_WEEKDAY_LABEL;

  protected readonly isEdit = computed(() => this.id() != null);
  protected readonly headerTitle = computed(() => (this.isEdit() ? 'Editar promoção' : 'Nova promoção'));

  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly removing = signal(false);
  protected readonly showRemoveConfirm = signal(false);

  protected readonly courts = signal<ArenaCourt[]>([]);

  protected readonly label = signal('');
  protected readonly active = signal(true);
  protected readonly allCourts = signal(true);
  protected readonly selectedCourtIds = signal<string[]>([]);
  protected readonly weekdays = signal<number[]>([]);
  protected readonly startTime = signal('14:00');
  protected readonly endTime = signal('17:00');
  protected readonly validFrom = signal('');
  protected readonly validUntil = signal('');
  protected readonly discountKind = signal<DiscountKind>('percent');
  protected readonly discountValue = signal('20');

  protected readonly canSave = computed(() => this.label().trim().length > 0 && parseNumber(this.discountValue()) > 0 && !this.saving());

  constructor() {
    effect(() => {
      const arenaId = this.arenaContext.arenaId();
      const promoId = this.id();
      if (!arenaId) return;
      void this.load(arenaId, promoId);
    });
  }

  private async load(arenaId: string, promoId: string | null): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      const db = arenaFirestore();
      const [courts, promotions] = await Promise.all([fetchCourtsList(db, arenaId), promoId ? fetchAllPromotions(db, arenaId) : Promise.resolve([])]);
      this.courts.set(courts);

      const promo = promoId ? promotions.find((p) => p.id === promoId) ?? null : null;
      if (promo) {
        this.label.set(promo.label);
        this.active.set(promo.active);
        this.allCourts.set(promo.courtIds.length === 0);
        this.selectedCourtIds.set(promo.courtIds);
        this.weekdays.set(promo.weekdays);
        this.startTime.set(promo.startTime);
        this.endTime.set(promo.endTime);
        this.validFrom.set(dateToInputValue(promo.validFrom));
        this.validUntil.set(dateToInputValue(promo.validUntil));
        if (promo.fixedPricePerHourReais != null) {
          this.discountKind.set('fixed');
          this.discountValue.set(String(promo.fixedPricePerHourReais));
        } else if (promo.discountPercent != null) {
          this.discountKind.set('percent');
          this.discountValue.set(String(promo.discountPercent));
        }
      }
    } catch {
      this.errorMessage.set('Não foi possível carregar a promoção.');
    } finally {
      this.loading.set(false);
    }
  }

  protected setAllCourts(value: boolean): void {
    this.allCourts.set(value);
  }

  protected toggleCourt(courtId: string): void {
    this.selectedCourtIds.update((current) => (current.includes(courtId) ? current.filter((id) => id !== courtId) : [...current, courtId]));
  }

  protected toggleWeekday(day: number): void {
    this.weekdays.update((current) => (current.includes(day) ? current.filter((d) => d !== day) : [...current, day]));
  }

  protected async save(): Promise<void> {
    if (!this.canSave()) return;
    const arenaId = this.arenaContext.arenaId();
    if (!arenaId) return;

    const value = parseNumber(this.discountValue());
    this.saving.set(true);
    this.errorMessage.set(null);
    try {
      const input = {
        label: this.label(),
        active: this.active(),
        courtIds: this.allCourts() ? [] : this.selectedCourtIds(),
        weekdays: this.weekdays(),
        startTime: this.startTime(),
        endTime: this.endTime(),
        discountPercent: this.discountKind() === 'percent' ? value : null,
        fixedPricePerHourReais: this.discountKind() === 'fixed' ? value : null,
        validFrom: inputValueToDate(this.validFrom()),
        validUntil: inputValueToDate(this.validUntil()),
      };
      const promoId = this.id();
      if (promoId) {
        await updatePromotion(arenaFirestore(), arenaId, promoId, input);
      } else {
        await createPromotion(arenaFirestore(), arenaId, input);
      }
      void this.router.navigate(['/painel/promocoes']);
    } catch (err) {
      this.errorMessage.set(err instanceof Error ? err.message : 'Não foi possível salvar a promoção.');
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove(): Promise<void> {
    const arenaId = this.arenaContext.arenaId();
    const promoId = this.id();
    if (!arenaId || !promoId) return;

    this.removing.set(true);
    try {
      await deletePromotion(arenaFirestore(), arenaId, promoId);
      this.showRemoveConfirm.set(false);
      void this.router.navigate(['/painel/promocoes']);
    } catch (err) {
      this.errorMessage.set(err instanceof Error ? err.message : 'Não foi possível remover a promoção.');
    } finally {
      this.removing.set(false);
    }
  }
}
