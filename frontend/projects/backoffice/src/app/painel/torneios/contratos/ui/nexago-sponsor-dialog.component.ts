import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { ConfirmDialogComponent } from '../../../ui/confirm-dialog.component';
import { FieldComponent } from '../../../ui/field.component';
import { brl } from '../../planos/data/tournament-plans';
import { SPONSOR_NAME_MAX, sponsorNameIssue, validateSponsorLogo, type TierUsage } from '../data/plan-contracts';

export interface NexagoSponsorDraft {
  name: string;
  tierId: string;
  file: File | null;
}

/** Patrocinador vendido pela NexaGO numa cota do evento; a logo é opcional e entra aprovada. */
@Component({
  selector: 'bo-nexago-sponsor-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ConfirmDialogComponent, FieldComponent],
  template: `
    <bo-confirm-dialog
      [open]="open()"
      title="Patrocinador da NexaGO"
      description="Cota vendida pela NexaGO neste evento. O organizador vê o patrocinador no portal, mas não troca nem remove."
      confirmLabel="Adicionar"
      size="md"
      [busy]="busy()"
      [error]="error() ?? fileError()"
      [confirmDisabled]="!valid()"
      (confirmed)="submit()"
      (dismissed)="dismissed.emit()"
    >
      <div class="form">
        <bo-field label="Nome" [hint]="nameHint()">
          <input class="bo-input" [attr.maxlength]="nameMax" [value]="name()" (input)="name.set(val($event))" aria-label="Nome do patrocinador" />
        </bo-field>
        <bo-field label="Cota">
          <select class="bo-select" aria-label="Cota" (change)="tierId.set(val($event))">
            <option value="" [selected]="tierId() === ''" disabled>Escolha a cota</option>
            @for (u of usage(); track u.tier.id) {
              <option [value]="u.tier.id" [selected]="tierId() === u.tier.id" [disabled]="u.left === 0">
                {{ u.tier.name }} · {{ brl(u.tier.priceCents) }} · {{ u.left === 0 ? 'esgotada' : u.left + ' livre' + (u.left > 1 ? 's' : '') }}
              </option>
            }
          </select>
        </bo-field>
        <bo-field label="Logo (opcional)" hint="PNG com fundo transparente de preferência; JPG, WebP ou SVG até 4 MB.">
          <div class="file">
            <label class="bo-mini-btn">
              <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" (change)="pick($event)" />
              {{ file() ? 'Trocar arquivo' : 'Escolher arquivo' }}
            </label>
            @if (preview(); as src) { <img [src]="src" alt="Prévia da logo" /> }
            @if (file(); as f) { <span class="fname">{{ f.name }}</span> }
          </div>
        </bo-field>
      </div>
    </bo-confirm-dialog>
  `,
  styles: `
    .form { display: flex; flex-direction: column; gap: 14px; }
    .file { display: flex; align-items: center; gap: 12px; min-width: 0; }
    .file label { position: relative; cursor: pointer; }
    .file input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
    .file img { width: 88px; height: 48px; object-fit: contain; border-radius: var(--nx-r-2); border: 1px solid var(--nx-line-strong);
      background: repeating-conic-gradient(#20242c 0% 25%, #171a20 0% 50%) 50% / 12px 12px; }
    .fname { min-width: 0; font-size: 11.5px; color: var(--nx-text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  `,
})
export class NexagoSponsorDialogComponent {
  readonly open = input(false);
  readonly usage = input.required<TierUsage[]>();
  readonly busy = input(false);
  readonly error = input<string | null>(null);

  readonly submitted = output<NexagoSponsorDraft>();
  readonly dismissed = output<void>();

  protected readonly brl = brl;
  protected readonly nameMax = SPONSOR_NAME_MAX;
  protected readonly name = signal('');
  protected readonly tierId = signal('');
  protected readonly file = signal<File | null>(null);
  protected readonly fileError = signal<string | null>(null);
  protected readonly preview = signal<string | null>(null);

  protected readonly nameHint = computed(() => (this.name() ? sponsorNameIssue(this.name()) ?? '' : ''));
  protected readonly valid = computed(
    () => sponsorNameIssue(this.name()) === null && this.usage().some((u) => u.tier.id === this.tierId() && u.left > 0),
  );

  constructor() {
    // Cada abertura começa do zero.
    effect(() => {
      if (!this.open()) return;
      untracked(() => {
        this.name.set('');
        this.tierId.set('');
        this.setFile(null);
        this.fileError.set(null);
      });
    });
    inject(DestroyRef).onDestroy(() => this.setFile(null));
  }

  protected pick(e: Event): void {
    const el = e.target as HTMLInputElement;
    const f = el.files?.[0] ?? null;
    el.value = '';
    if (!f) return;
    const issue = validateSponsorLogo(f);
    this.fileError.set(issue);
    if (!issue) this.setFile(f);
  }

  protected submit(): void {
    if (!this.valid()) return;
    this.submitted.emit({ name: this.name().trim(), tierId: this.tierId(), file: this.file() });
  }

  private setFile(f: File | null): void {
    const old = this.preview();
    if (old) URL.revokeObjectURL(old);
    this.file.set(f);
    this.preview.set(f ? URL.createObjectURL(f) : null);
  }

  protected val(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }
}
