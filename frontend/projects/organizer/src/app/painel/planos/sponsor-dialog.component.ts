import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, output, signal } from '@angular/core';
import {
  SPONSOR_NAME_MAX,
  brl,
  sponsorNameIssue,
  tierDeliveryLabel,
  validatePlanSponsorLogo,
  type TierUsage,
} from '../data/plan-contracts';
import { addPlanSponsor, newPlanSponsorId, uploadPlanSponsorLogo } from '../data/plan-contracts-repository';
import { OgIconComponent } from '../ui/icon.component';

/** Adicionar patrocinador a uma cota do evento (26b). O logo é opcional aqui: sem ele o
 *  patrocinador entra como "Enviar logo" e a linha da lista oferece o envio depois. */
@Component({
  selector: 'og-sponsor-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OgIconComponent],
  host: {
    class: 'og-dialog-backdrop',
    '(click)': 'close()',
    '(document:keydown.escape)': 'close()',
  },
  template: `
    <div class="og-dialog" role="dialog" aria-modal="true" aria-labelledby="og-sponsor-title" (click)="$event.stopPropagation()">
      <div class="top">
        <h2 id="og-sponsor-title" class="title">Adicionar patrocinador</h2>
        <button type="button" class="og-ghost-btn" aria-label="Fechar" (click)="close()">
          <og-icon name="close" [size]="16" />
        </button>
      </div>

      <label class="og-field">
        <span class="og-field-label">Nome</span>
        <input
          class="og-input-el"
          type="text"
          placeholder="Ex.: Açaí da Praia"
          [attr.maxlength]="nameMax"
          [value]="name()"
          (input)="onName($event)"
        />
      </label>

      <div class="og-field">
        <span class="og-field-label">Cota</span>
        <div class="tiers" role="radiogroup" aria-label="Cota">
          @for (u of usage(); track u.tier.id) {
            <button
              type="button"
              role="radio"
              class="tier"
              [class.selected]="u.tier.id === tierId()"
              [attr.aria-checked]="u.tier.id === tierId()"
              [disabled]="u.left === 0"
              [style.border-top-color]="u.tier.color"
              (click)="tierId.set(u.tier.id)"
            >
              <span class="tier-name" [style.color]="u.tier.color">{{ u.tier.name }} · {{ brl(u.tier.priceCents) }}</span>
              <span class="tier-desc">{{ delivery(u) }}</span>
              <span class="tier-left">{{ u.left === 0 ? 'Esgotada' : (u.left === 1 ? 'Resta 1' : 'Restam ' + u.left) }}</span>
            </button>
          }
        </div>
      </div>

      <div class="og-field">
        <span class="og-field-label">Logo (opcional)</span>
        <div class="logo">
          <div class="logo-box">
            @if (preview(); as src) {
              <img [src]="src" alt="" />
            } @else {
              <span>LOGO</span>
            }
          </div>
          <div class="logo-body">
            <button type="button" class="og-mini-btn" [disabled]="busy()" (click)="fileInput.click()">
              {{ file() ? 'Trocar arquivo' : 'Escolher arquivo' }}
            </button>
            <span class="hint">PNG com fundo transparente, 1200 × 300 px. Dá pra enviar depois.</span>
          </div>
          <input #fileInput type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden (change)="onFile($event)" />
        </div>
      </div>

      @if (error(); as e) {
        <p class="error">{{ e }}</p>
      }

      <div class="actions">
        <button type="button" class="og-mini-btn" [disabled]="busy()" (click)="close()">Voltar</button>
        <button type="button" class="og-mini-btn og-mini-btn-primary" [disabled]="!canSubmit()" (click)="submit()">
          {{ busy() ? 'Salvando…' : 'Adicionar' }}
        </button>
      </div>
    </div>
  `,
  styles: `
    :host {
      position: fixed;
      inset: 0;
      z-index: 60;
      display: grid;
      place-items: center;
      padding: 20px;
      background: rgba(7, 7, 8, 0.66);
      backdrop-filter: blur(4px);
    }
    .og-dialog {
      width: min(560px, 100%);
      max-height: calc(100dvh - 40px);
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 18px;
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-4);
      padding: 22px;
      box-shadow: 0 24px 64px rgba(0, 0, 0, 0.45);
    }
    .top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .title {
      margin: 0;
      font-family: var(--nx-font-display);
      font-size: 18px;
      font-weight: 800;
      color: var(--nx-text);
    }
    .tiers {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 10px;
    }
    .tier {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 4px;
      padding: 12px 14px;
      text-align: left;
      border-radius: var(--nx-r-3);
      background: var(--nx-surface-1);
      border: 1px solid transparent;
      border-top: 2px solid;
      cursor: pointer;
      color: var(--nx-text);
    }
    .tier.selected {
      border-color: var(--nx-orange-500);
      background: var(--nx-orange-tint);
    }
    .tier:disabled {
      opacity: 0.45;
      cursor: default;
    }
    .tier-name {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 13px;
    }
    .tier-desc,
    .hint {
      font-family: var(--nx-font-ui);
      font-size: 11.5px;
      line-height: 1.45;
      color: var(--nx-text-dim);
    }
    .tier-left {
      font-family: var(--nx-font-mono);
      font-size: 10px;
      color: var(--nx-text-mute);
    }
    .logo {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .logo-box {
      flex: none;
      width: 120px;
      height: 30px;
      border-radius: 6px;
      border: 1.5px dashed var(--nx-line-strong);
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      background: repeating-linear-gradient(45deg, var(--nx-surface-1) 0 6px, var(--nx-surface-2) 6px 12px);
      font-family: var(--nx-font-mono);
      font-size: 8.5px;
      color: var(--nx-text-dim);
    }
    .logo-box img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    .logo-body {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 6px;
    }
    .error {
      margin: 0;
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      color: var(--nx-live);
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
  `,
})
export class OgSponsorDialogComponent {
  readonly tournamentId = input.required<string>();
  readonly usage = input.required<TierUsage[]>();

  readonly closed = output<void>();
  readonly added = output<string>();

  protected readonly brl = brl;
  protected readonly nameMax = SPONSOR_NAME_MAX;

  protected readonly name = signal('');
  protected readonly tierId = signal('');
  protected readonly file = signal<File | null>(null);
  protected readonly preview = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly canSubmit = computed(() => {
    const tier = this.usage().find((u) => u.tier.id === this.tierId());
    return !this.busy() && sponsorNameIssue(this.name()) === null && tier != null && tier.left > 0;
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.revokePreview());
  }

  protected delivery(u: TierUsage): string {
    return tierDeliveryLabel(u.tier);
  }

  protected onName(event: Event): void {
    this.name.set((event.target as HTMLInputElement).value);
  }

  protected onFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const picked = input.files?.[0] ?? null;
    input.value = '';
    if (!picked) return;
    const issue = validatePlanSponsorLogo(picked);
    if (issue) {
      this.error.set(issue);
      return;
    }
    this.error.set(null);
    this.revokePreview();
    this.file.set(picked);
    this.preview.set(URL.createObjectURL(picked));
  }

  protected async submit(): Promise<void> {
    if (!this.canSubmit()) return;
    this.busy.set(true);
    this.error.set(null);
    const tournamentId = this.tournamentId();
    const sponsorId = newPlanSponsorId();
    try {
      const file = this.file();
      const logoUrl = file ? await uploadPlanSponsorLogo(tournamentId, sponsorId, file) : null;
      await addPlanSponsor({ tournamentId, sponsorId, name: this.name().trim(), tierId: this.tierId(), logoUrl });
      this.added.emit(this.name().trim());
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Não foi possível adicionar o patrocinador.');
    } finally {
      this.busy.set(false);
    }
  }

  protected close(): void {
    if (!this.busy()) this.closed.emit();
  }

  private revokePreview(): void {
    const url = this.preview();
    if (url) URL.revokeObjectURL(url);
  }
}
