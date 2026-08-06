import { ChangeDetectionStrategy, Component, ElementRef, computed, input, output, viewChild } from '@angular/core';
import { NxSpinnerComponent } from '../shared/loading/nx-spinner.component';
import { MAX_HIGHLIGHT_PHOTOS } from '../data/athlete-highlight-upload';

/**
 * Grid de edição das fotos de destaque — espelho web do
 * `EditProfileHighlightsGrid` do app, inclusive na copy do contador.
 *
 * É de apresentação: escolher arquivo e remover só emitem eventos. Quem
 * orquestra recorte, upload e persistência é o componente de perfil, do mesmo
 * jeito que já faz com avatar e capa.
 */
@Component({
  selector: 'app-athlete-highlights-editor',
  imports: [NxSpinnerComponent],
  template: `
    <div class="he">
      <ul class="he-grid">
        @for (photo of photos(); track photo; let i = $index) {
          <li class="he-cell">
            <img class="he-img" [src]="photo" alt="" loading="lazy" decoding="async" />
            <button
              type="button"
              class="he-remove"
              [disabled]="busy()"
              [attr.aria-label]="'Remover foto ' + (i + 1)"
              (click)="remove.emit(i)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </li>
        }

        @if (uploading()) {
          <li class="he-cell he-cell--busy">
            <app-nx-spinner [size]="18" />
          </li>
        }

        @if (canAdd()) {
          <li class="he-cell he-cell--add">
            <button type="button" class="he-add" [disabled]="busy()" (click)="chooseFile()">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="14" rx="2" /><path d="m3 14 4-4 5 5M17 11v6M14 14h6" /></svg>
              <span>Adicionar</span>
            </button>
          </li>
        }
      </ul>

      <input
        #fileInput
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        (change)="onFileSelected($event)"
      />

      <p class="he-counter">{{ counterLabel() }}</p>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }

    .he-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: var(--nx-s-2);
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .he-cell {
      position: relative;
      aspect-ratio: 1;
      overflow: hidden;
      background: var(--nx-surface-1);
      border-radius: var(--nx-r-3);
    }

    .he-cell--busy {
      display: grid;
      place-items: center;
      border: 1px dashed var(--nx-line-strong);
    }

    .he-cell--add {
      background: none;
    }

    .he-img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .he-remove {
      position: absolute;
      top: 4px;
      right: 4px;
      display: grid;
      place-items: center;
      /* Alvo de 32px visual com área de toque estendida pelo ::before. */
      width: 32px;
      height: 32px;
      background: rgba(0, 0, 0, 0.62);
      border: 0;
      border-radius: var(--nx-r-pill);
      color: #fff;
      cursor: pointer;
      transition: background var(--nx-d-fast) var(--nx-ease-out);
    }

    .he-remove::before {
      content: '';
      position: absolute;
      top: -6px;
      right: -6px;
      bottom: -6px;
      left: -6px;
    }

    .he-remove:hover:not(:disabled) {
      background: var(--nx-live);
    }

    .he-remove:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .he-add {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 4px;
      width: 100%;
      height: 100%;
      padding: 4px;
      background: var(--nx-orange-tint);
      border: 1.5px dashed rgba(255, 106, 26, 0.45);
      border-radius: var(--nx-r-3);
      font-family: var(--nx-font-ui);
      font-size: 11px;
      font-weight: 600;
      color: var(--nx-orange-500);
      cursor: pointer;
      transition: background var(--nx-d-fast) var(--nx-ease-out), border-color var(--nx-d-fast) var(--nx-ease-out);
    }

    .he-add:hover:not(:disabled) {
      background: rgba(255, 106, 26, 0.18);
      border-color: var(--nx-orange-500);
    }

    .he-add:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .he-add:focus-visible,
    .he-remove:focus-visible {
      outline: 2px solid var(--nx-orange-500);
      outline-offset: 2px;
    }

    .he-counter {
      margin: var(--nx-s-3) 0 0;
      font-family: var(--nx-font-ui);
      font-size: 12px;
      font-weight: 500;
      color: var(--nx-text-mute);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AthleteHighlightsEditorComponent {
  readonly photos = input<readonly string[]>([]);
  readonly uploading = input(false);
  readonly removing = input(false);

  readonly fileChosen = output<File>();
  readonly remove = output<number>();

  protected readonly maxPhotos = MAX_HIGHLIGHT_PHOTOS;

  private readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');

  protected readonly busy = computed(() => this.uploading() || this.removing());
  protected readonly canAdd = computed(() => this.photos().length + (this.uploading() ? 1 : 0) < MAX_HIGHLIGHT_PHOTOS);

  /** Mesma frase do app (`edit_profile_highlights_section.dart`). */
  protected readonly counterLabel = computed(
    () => `${this.photos().length}/${MAX_HIGHLIGHT_PHOTOS} fotos · aparecem no seu perfil público`,
  );

  protected chooseFile(): void {
    this.fileInput()?.nativeElement.click();
  }

  protected onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    // Limpa antes de emitir pra que escolher o MESMO arquivo de novo dispare (change).
    input.value = '';
    if (file) {
      this.fileChosen.emit(file);
    }
  }
}
