import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal } from '@angular/core';
import { validateArenaImageFile } from '../profile/arena-profile-repository';
import { IconComponent } from '../ui/icon.component';

/** Campo "Foto do produto" do cadastro/edição de estoque. Não sobe nada sozinho: só escolhe o
 *  arquivo (validado com o mesmo limite do storage.rules) e mostra a prévia — quem salva o
 *  produto decide quando enviar. Sem foto, a prévia cai no emoji. */
@Component({
  selector: 'ar-product-image-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <div class="field">
      <div class="preview" [class.has-image]="!!previewUrl()">
        @if (previewUrl(); as url) {
          <img [src]="url" alt="Foto do produto" />
        } @else {
          <span class="fallback" aria-hidden="true">{{ emoji() || '🛒' }}</span>
        }
      </div>
      <div class="actions">
        <button type="button" class="ar-mini-btn" [disabled]="disabled()" (click)="fileInput.click()">
          <ar-icon name="camera" [size]="14" />
          {{ previewUrl() ? 'Trocar foto' : 'Adicionar foto' }}
        </button>
        @if (previewUrl()) {
          <button type="button" class="ar-ghost-btn" [disabled]="disabled()" (click)="clear()">Remover foto</button>
        }
        <input
          #fileInput
          type="file"
          accept="image/jpeg,image/png,image/webp"
          class="hidden-input"
          aria-label="Selecionar foto do produto"
          (change)="onFileSelected($event)"
        />
        <p class="hint" [class.error]="!!error()">{{ error() ?? 'JPG, PNG ou WebP de até 25 MB. Aparece na comanda e no cardápio.' }}</p>
      </div>
    </div>
  `,
  styles: `
    .field {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .preview {
      width: 88px;
      height: 88px;
      flex: none;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      border: 1px dashed var(--nx-line-strong);
      display: grid;
      place-items: center;
      overflow: hidden;
    }

    .preview.has-image {
      border-style: solid;
      border-color: var(--nx-line);
    }

    .preview img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .fallback {
      font-size: 32px;
      line-height: 1;
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }

    .hint {
      flex-basis: 100%;
      margin: 2px 0 0;
      font-size: 12px;
      color: var(--nx-text-dim);
    }

    .hint.error {
      color: var(--nx-live);
    }

    .hidden-input {
      position: absolute;
      width: 1px;
      height: 1px;
      opacity: 0;
      pointer-events: none;
    }
  `,
})
export class ProductImageFieldComponent {
  /** Foto já salva no produto (URL do Storage). */
  readonly imageUrl = input<string | null>(null);
  /** Arquivo escolhido e ainda não enviado — tem prioridade na prévia. */
  readonly file = input<File | null>(null);
  readonly emoji = input('');
  readonly disabled = input(false);

  readonly picked = output<File>();
  readonly cleared = output<void>();

  protected readonly error = signal<string | null>(null);

  private readonly fileObjectUrl = computed(() => {
    const f = this.file();
    return f ? URL.createObjectURL(f) : null;
  });

  protected readonly previewUrl = computed(() => this.fileObjectUrl() ?? (this.imageUrl()?.trim() || null));

  constructor() {
    // Libera a URL temporária da prévia anterior quando o arquivo muda ou o campo some.
    effect((onCleanup) => {
      const url = this.fileObjectUrl();
      onCleanup(() => {
        if (url) URL.revokeObjectURL(url);
      });
    });
  }

  protected onFileSelected(event: Event): void {
    const inputEl = event.target as HTMLInputElement;
    const f = inputEl.files?.[0];
    inputEl.value = '';
    if (!f) return;
    const err = validateArenaImageFile(f);
    this.error.set(err);
    if (!err) this.picked.emit(f);
  }

  protected clear(): void {
    this.error.set(null);
    this.cleared.emit();
  }
}
