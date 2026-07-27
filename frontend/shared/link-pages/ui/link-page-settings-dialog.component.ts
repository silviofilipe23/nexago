import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import {
  slugifyLinkPage,
  validateLinkPageSlug,
  type LinkPage,
  type LinkPageHighlight,
} from '../link-page.model';

export interface LinkPageSettingsValue {
  slug: string;
  title: string;
  handle: string;
  bio: string;
  highlights: LinkPageHighlight[];
  published: boolean;
}

const MAX_HIGHLIGHTS = 3;

/** Modal de configuração da página: endereço público, identidade e destaques do topo.
 *  O endereço é a única parte que exige Cloud Function (registro atômico do slug), por isso
 *  o diálogo só emite o valor — quem salva é o `nx-link-manager`. */
@Component({
  selector: 'nx-link-page-settings-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  template: `
    <div class="scrim" (click)="dismiss.emit()">
      <div class="panel" role="dialog" aria-modal="true" (click)="$event.stopPropagation()">
        <h2 class="title">{{ page() ? 'Configurar página' : 'Criar sua página de links' }}</h2>
        <p class="lead">O endereço é público — compartilhe na bio do Instagram, no WhatsApp e nos cartazes.</p>

        <form [formGroup]="form" (ngSubmit)="submit()">
          <label class="field">
            <span class="label">Endereço público</span>
            <div class="slug-row">
              <span class="slug-prefix">{{ baseUrl() }}/{{ prefix() }}/</span>
              <input class="input slug-input" formControlName="slug" placeholder="minha-arena" spellcheck="false" />
            </div>
          </label>

          <label class="field">
            <span class="label">Nome exibido</span>
            <input class="input" formControlName="title" maxlength="60" />
          </label>

          <label class="field">
            <span class="label">Arroba <span class="optional">opcional</span></span>
            <input class="input" formControlName="handle" placeholder="arena.cfc" maxlength="40" spellcheck="false" />
          </label>

          <label class="field">
            <span class="label">Bio <span class="optional">opcional</span></span>
            <textarea class="input textarea" formControlName="bio" rows="3" maxlength="180"></textarea>
          </label>

          <div class="field">
            <span class="label">Destaques <span class="optional">até {{ maxHighlights }}</span></span>
            @for (h of highlights(); track $index) {
              <div class="highlight-row">
                <input
                  class="input"
                  [value]="h.value"
                  placeholder="4.8"
                  maxlength="10"
                  (input)="updateHighlight($index, 'value', $event)"
                />
                <input
                  class="input"
                  [value]="h.label"
                  placeholder="AVALIAÇÃO"
                  maxlength="16"
                  (input)="updateHighlight($index, 'label', $event)"
                />
                <button type="button" class="btn icon-btn" aria-label="Remover destaque" (click)="removeHighlight($index)">×</button>
              </div>
            }
            @if (highlights().length < maxHighlights) {
              <button type="button" class="btn add-btn" (click)="addHighlight()">+ Adicionar destaque</button>
            }
          </div>

          <label class="switch">
            <input type="checkbox" formControlName="published" />
            <span>
              <strong>Página publicada</strong>
              <em>Desative para tirar a página do ar sem apagar os links</em>
            </span>
          </label>

          @if (error(); as msg) {
            <p class="error">{{ msg }}</p>
          }

          <footer class="actions">
            <span class="spacer"></span>
            <button type="button" class="btn" (click)="dismiss.emit()">Cancelar</button>
            <button type="submit" class="btn primary" [disabled]="saving()">
              {{ saving() ? 'Salvando…' : page() ? 'Salvar' : 'Criar página' }}
            </button>
          </footer>
        </form>
      </div>
    </div>
  `,
  styles: `
    .scrim {
      position: fixed;
      inset: 0;
      z-index: 1000;
      background: rgba(0, 0, 0, 0.6);
      display: grid;
      place-items: center;
      padding: 24px;
    }

    .panel {
      width: 100%;
      max-width: 480px;
      max-height: calc(100dvh - 48px);
      overflow-y: auto;
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line-strong);
      border-radius: var(--nx-r-4);
      padding: 24px;
      box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
    }

    .title {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 18px;
      letter-spacing: -0.02em;
      color: var(--nx-text);
      margin: 0 0 6px;
    }

    .lead {
      font-size: 12.5px;
      color: var(--nx-text-mute);
      margin: 0 0 18px;
    }

    .field {
      display: block;
      margin-bottom: 14px;
    }

    .label {
      display: block;
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      margin-bottom: 6px;
    }

    .optional {
      opacity: 0.7;
      letter-spacing: 0.1em;
    }

    .input {
      width: 100%;
      box-sizing: border-box;
      height: 40px;
      padding: 0 12px;
      border-radius: var(--nx-r-2);
      border: 1px solid var(--nx-line-strong);
      background: var(--nx-surface-1);
      color: var(--nx-text);
      font-family: var(--nx-font-ui);
      font-size: 13.5px;
      outline: none;
    }

    .input:focus {
      border-color: var(--nx-orange-500);
    }

    .textarea {
      height: auto;
      padding: 10px 12px;
      resize: vertical;
      line-height: 1.5;
    }

    .slug-row {
      display: flex;
      align-items: center;
      gap: 0;
      border-radius: var(--nx-r-2);
      border: 1px solid var(--nx-line-strong);
      background: var(--nx-surface-1);
      overflow: hidden;
    }

    .slug-prefix {
      padding: 0 2px 0 12px;
      font-family: var(--nx-font-mono);
      font-size: 12px;
      color: var(--nx-text-dim);
      white-space: nowrap;
    }

    .slug-input {
      border: none;
      background: transparent;
      font-family: var(--nx-font-mono);
      font-size: 12.5px;
      padding-left: 0;
    }

    .highlight-row {
      display: grid;
      grid-template-columns: 90px 1fr 34px;
      gap: 8px;
      margin-bottom: 8px;
    }

    .switch {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      cursor: pointer;
      margin-top: 4px;
    }

    .switch input {
      margin-top: 2px;
      accent-color: var(--nx-orange-500);
      width: 15px;
      height: 15px;
    }

    .switch strong {
      display: block;
      font-size: 13px;
      font-weight: 600;
      color: var(--nx-text);
    }

    .switch em {
      display: block;
      font-style: normal;
      font-size: 11.5px;
      color: var(--nx-text-dim);
      margin-top: 1px;
    }

    .error {
      margin: 12px 0 0;
      font-size: 12.5px;
      color: var(--nx-live);
    }

    .actions {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 20px;
    }

    .spacer {
      flex: 1;
    }

    .btn {
      height: 34px;
      padding: 0 14px;
      border-radius: var(--nx-r-2);
      border: 1px solid var(--nx-line-strong);
      background: var(--nx-surface-1);
      color: var(--nx-text);
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      font-weight: 600;
      cursor: pointer;
      transition: all 140ms var(--nx-ease-out);
    }

    .btn:hover:not(:disabled) {
      background: var(--nx-surface-2);
    }

    .btn:disabled {
      opacity: 0.5;
      cursor: default;
    }

    .btn.primary {
      background: var(--nx-orange-500);
      border-color: var(--nx-orange-500);
      color: #140a04;
    }

    .icon-btn {
      padding: 0;
      font-size: 16px;
      line-height: 1;
      height: 40px;
    }

    .add-btn {
      height: 32px;
      font-size: 12px;
    }
  `,
})
export class LinkPageSettingsDialogComponent {
  private readonly fb = inject(FormBuilder);

  readonly page = input<LinkPage | null>(null);
  readonly baseUrl = input.required<string>();
  readonly prefix = input.required<string>();
  readonly defaultTitle = input('');
  readonly saving = input(false);
  readonly serverError = input<string | null>(null);

  readonly save = output<LinkPageSettingsValue>();
  readonly dismiss = output<void>();

  protected readonly maxHighlights = MAX_HIGHLIGHTS;
  protected readonly highlights = signal<LinkPageHighlight[]>([]);
  private readonly localError = signal<string | null>(null);

  protected readonly error = computed(() => this.localError() ?? this.serverError());

  protected readonly form = this.fb.nonNullable.group({
    slug: [''],
    title: [''],
    handle: [''],
    bio: [''],
    published: [true],
  });

  constructor() {
    effect(() => {
      const page = this.page();
      const fallbackTitle = this.defaultTitle();
      this.highlights.set(page ? page.highlights.map((h) => ({ ...h })) : []);
      this.form.reset({
        slug: page?.slug ?? slugifyLinkPage(fallbackTitle),
        title: page?.title ?? fallbackTitle,
        handle: page?.handle ?? '',
        bio: page?.bio ?? '',
        published: page?.published ?? true,
      });
    });
  }

  protected addHighlight(): void {
    this.highlights.update((list) => [...list, { value: '', label: '' }]);
  }

  protected removeHighlight(index: number): void {
    this.highlights.update((list) => list.filter((_, i) => i !== index));
  }

  protected updateHighlight(index: number, field: keyof LinkPageHighlight, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.highlights.update((list) => list.map((h, i) => (i === index ? { ...h, [field]: value } : h)));
  }

  protected submit(): void {
    const raw = this.form.getRawValue();
    const slug = slugifyLinkPage(raw.slug);
    const title = raw.title.trim();

    if (!title) {
      this.localError.set('Informe o nome exibido na página.');
      return;
    }
    const slugError = validateLinkPageSlug(slug);
    if (slugError) {
      this.localError.set(slugError);
      return;
    }

    this.localError.set(null);
    this.save.emit({
      slug,
      title,
      handle: raw.handle.trim().replace(/^@/, ''),
      bio: raw.bio.trim(),
      highlights: this.highlights()
        .map((h) => ({ value: h.value.trim(), label: h.label.trim().toUpperCase() }))
        .filter((h) => h.value !== ''),
      published: raw.published,
    });
  }
}
