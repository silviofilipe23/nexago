import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ArenaContextService } from '../data/arena-context.service';
import { ARENA_SPORT_OPTIONS } from '../data/arena-profile.model';
import { arenaFirestore } from '../data/firestore';
import { formatCentsInputValue, parseBRLInputToCents } from '../stock/product.model';
import { IconComponent } from '../ui/icon.component';
import { ModalComponent } from '../ui/modal.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { ARENA_COURT_STATUS_LABEL, type ArenaCourt, type ArenaCourtStatus } from './court.model';
import { createCourt, deleteCourt, fetchCourt, updateCourt } from './courts-repository';

const STATUS_OPTIONS: ArenaCourtStatus[] = ['active', 'maintenance'];

/** Tela Nova/Editar quadra: CRUD real em `arenas/{arenaId}/courts`. Sem cobertura, sem
 *  "abre às/fecha às" por quadra (o horário real é compartilhado por todas as quadras da
 *  arena, na tela Perfil › Horários) e sem foto (Storage não integrado, sem referência real
 *  em nenhuma das duas plataformas ainda). */
@Component({
  selector: 'ar-panel-court-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelShellComponent, PageHeaderComponent, PanelCardComponent, IconComponent, ModalComponent],
  template: `
    <ar-panel-shell>
      <ar-page-header [title]="headerTitle()" [subtitle]="headerSubtitle()">
        <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="!canSave() || saving()" (click)="save()">
          <ar-icon name="check" [size]="14" />
          {{ saving() ? 'Salvando…' : 'Salvar quadra' }}
        </button>
      </ar-page-header>

      <div class="body">
        <div class="form-col">
          @if (loading()) {
            <p class="state-text">Carregando quadra…</p>
          } @else {
            @if (errorMessage(); as err) {
              <div class="error-banner">{{ err }}</div>
            }

            <ar-panel-card title="Informações básicas">
              <div class="field-label">Nome da quadra</div>
              <input type="text" class="input-box name-input" placeholder="Ex.: Quadra 4" [value]="name()" (input)="name.set($any($event.target).value)" />

              <div class="field-label">Modalidades</div>
              <div class="ar-filter-bar">
                @for (opt of sportOptions; track opt) {
                  <button type="button" class="ar-chip" [class.active]="types().includes(opt)" (click)="toggleType(opt)">{{ opt }}</button>
                }
              </div>
            </ar-panel-card>

            <ar-panel-card title="Preço">
              <div class="field-label">Preço por hora</div>
              <div class="price-box">
                <span>R$</span>
                <input type="text" inputmode="decimal" [value]="priceValue()" (input)="priceValue.set($any($event.target).value)" />
              </div>
            </ar-panel-card>

            <ar-panel-card title="Status">
              <div class="ar-filter-bar">
                @for (opt of statusOptions; track opt) {
                  <button type="button" class="ar-chip" [class.active]="status() === opt" (click)="status.set(opt)">{{ statusLabel[opt] }}</button>
                }
              </div>
            </ar-panel-card>

            @if (isEdit()) {
              <button type="button" class="remove-link" (click)="showRemoveConfirm.set(true)">
                <ar-icon name="alert-triangle" [size]="14" />
                Remover quadra
              </button>
            }
          }
        </div>
      </div>

      @if (showRemoveConfirm()) {
        <ar-modal (close)="showRemoveConfirm.set(false)">
          <h2 class="confirm-title">Remover quadra?</h2>
          <p class="confirm-body">"{{ name() }}" será removida — não afeta reservas já feitas, mas essa quadra some do painel e da busca.</p>
          <div class="confirm-actions">
            <button type="button" class="ar-ghost-btn" [disabled]="removing()" (click)="showRemoveConfirm.set(false)">Cancelar</button>
            <button type="button" class="ar-mini-btn danger-btn" [disabled]="removing()" (click)="remove()">
              {{ removing() ? 'Removendo…' : 'Remover quadra' }}
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
      justify-content: center;
      overflow: auto;
    }

    .form-col {
      width: 100%;
      max-width: 860px;
      display: flex;
      flex-direction: column;
      gap: 16px;
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

    .field-label {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      margin-bottom: 10px;
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

    .price-box {
      height: 46px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 0 14px;
      box-sizing: border-box;
      max-width: 220px;
    }

    .price-box:focus-within {
      border-color: var(--nx-orange-500);
    }

    .price-box span {
      font-family: var(--nx-font-mono);
      font-size: 13px;
      color: var(--nx-text-dim);
    }

    .price-box input {
      flex: 1;
      min-width: 0;
      background: transparent;
      border: none;
      outline: none;
      color: var(--nx-text);
      font-family: var(--nx-font-ui);
      font-size: 14px;
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
  `,
})
export class PanelCourtFormComponent {
  private readonly arenaContext = inject(ArenaContextService);
  private readonly router = inject(Router);

  readonly id = input<string | null>(null);

  protected readonly sportOptions = ARENA_SPORT_OPTIONS;
  protected readonly statusOptions = STATUS_OPTIONS;
  protected readonly statusLabel = ARENA_COURT_STATUS_LABEL;

  protected readonly isEdit = computed(() => this.id() != null);

  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly removing = signal(false);
  protected readonly showRemoveConfirm = signal(false);

  protected readonly name = signal('');
  protected readonly types = signal<string[]>([]);
  protected readonly priceValue = signal('0,00');
  protected readonly status = signal<ArenaCourtStatus>('active');

  protected readonly headerTitle = computed(() => (this.isEdit() ? 'Editar quadra' : 'Nova quadra'));
  protected readonly headerSubtitle = computed(() => {
    const arenaName = this.arenaContext.arenaName() ?? 'Arena';
    return this.isEdit() ? `Editar quadra na ${arenaName}` : `Cadastrar quadra na ${arenaName}`;
  });

  protected readonly canSave = computed(() => this.name().trim().length > 0 && !this.saving());

  constructor() {
    effect(() => {
      const arenaId = this.arenaContext.arenaId();
      const courtId = this.id();
      if (!arenaId) return;
      void this.load(arenaId, courtId);
    });
  }

  private async load(arenaId: string, courtId: string | null): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      if (courtId) {
        const court = await fetchCourt(arenaFirestore(), arenaId, courtId);
        if (court) {
          this.name.set(court.name);
          this.types.set(court.types);
          this.status.set(court.status);
          this.priceValue.set(formatCentsInputValue(Math.round((court.basePricePerHourReais ?? 0) * 100)));
        }
      }
    } catch {
      this.errorMessage.set('Não foi possível carregar a quadra.');
    } finally {
      this.loading.set(false);
    }
  }

  protected toggleType(sport: string): void {
    this.types.update((current) => (current.includes(sport) ? current.filter((s) => s !== sport) : [...current, sport]));
  }

  protected async save(): Promise<void> {
    if (!this.canSave()) return;
    const arenaId = this.arenaContext.arenaId();
    if (!arenaId) return;

    this.saving.set(true);
    this.errorMessage.set(null);
    const input = {
      name: this.name(),
      types: this.types(),
      status: this.status(),
      basePricePerHourReais: parseBRLInputToCents(this.priceValue()) / 100 || null,
    };
    try {
      const courtId = this.id();
      if (courtId) {
        await updateCourt(arenaFirestore(), arenaId, courtId, input);
      } else {
        await createCourt(arenaFirestore(), arenaId, input);
      }
      void this.router.navigate(['/painel/quadras']);
    } catch (err) {
      this.errorMessage.set(err instanceof Error ? err.message : 'Não foi possível salvar a quadra.');
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove(): Promise<void> {
    const arenaId = this.arenaContext.arenaId();
    const courtId = this.id();
    if (!arenaId || !courtId) return;

    this.removing.set(true);
    try {
      await deleteCourt(arenaFirestore(), arenaId, courtId);
      this.showRemoveConfirm.set(false);
      void this.router.navigate(['/painel/quadras']);
    } catch (err) {
      this.errorMessage.set(err instanceof Error ? err.message : 'Não foi possível remover a quadra.');
    } finally {
      this.removing.set(false);
    }
  }
}
