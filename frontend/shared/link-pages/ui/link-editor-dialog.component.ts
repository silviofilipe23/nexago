import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  LINK_ICON_OPTIONS,
  validateLinkUrl,
  type LinkIconName,
  type PageLink,
} from '../link-page.model';
import type { PageLinkInput } from '../link-pages-repository';
import { LinkIconComponent } from './link-icon.component';

/** Modal de criar/editar um link. Compartilhado pelos painéis da arena e do organizador —
 *  por isso traz o próprio scrim em vez de depender do `ar-modal`/equivalente de cada portal. */
@Component({
  selector: 'nx-link-editor-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, LinkIconComponent],
  template: `
    <div class="scrim" (click)="dismiss.emit()">
      <div class="panel" role="dialog" aria-modal="true" (click)="$event.stopPropagation()">
        <h2 class="title">{{ isEditing() ? 'Editar link' : 'Novo link' }}</h2>

        <form [formGroup]="form" (ngSubmit)="submit()">
          <label class="field">
            <span class="label">Título</span>
            <input class="input" formControlName="title" placeholder="Reserve sua quadra" maxlength="60" />
          </label>

          <label class="field">
            <span class="label">Descrição <span class="optional">opcional</span></span>
            <input class="input" formControlName="subtitle" placeholder="Horários em tempo real" maxlength="80" />
          </label>

          <label class="field">
            <span class="label">Destino</span>
            <input class="input" formControlName="url" placeholder="nexago.com.br/arena/minha-arena" inputmode="url" />
          </label>

          <div class="field">
            <span class="label">Ícone</span>
            <div class="icons">
              @for (option of iconOptions; track option.name) {
                <button
                  type="button"
                  class="icon-option"
                  [class.selected]="icon() === option.name"
                  [attr.aria-label]="option.label"
                  [title]="option.label"
                  (click)="icon.set(option.name)"
                >
                  <nx-link-icon [name]="option.name" [size]="17" />
                </button>
              }
            </div>
          </div>

          <div class="switches">
            <label class="switch">
              <input type="checkbox" formControlName="active" />
              <span>
                <strong>Ativo</strong>
                <em>Aparece na página pública</em>
              </span>
            </label>
            <label class="switch">
              <input type="checkbox" formControlName="featured" />
              <span>
                <strong>Destaque</strong>
                <em>Cartão laranja no topo — só um por página</em>
              </span>
            </label>
            <label class="switch">
              <input type="checkbox" formControlName="live" />
              <span>
                <strong>Ao vivo</strong>
                <em>Mostra o selo LIVE ao lado do link</em>
              </span>
            </label>
          </div>

          @if (error(); as msg) {
            <p class="error">{{ msg }}</p>
          }

          <footer class="actions">
            @if (isEditing()) {
              <button type="button" class="btn danger" (click)="remove.emit(link()!.id)">Excluir</button>
            }
            <span class="spacer"></span>
            <button type="button" class="btn" (click)="dismiss.emit()">Cancelar</button>
            <button type="submit" class="btn primary" [disabled]="saving()">
              {{ saving() ? 'Salvando…' : 'Salvar link' }}
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
      max-width: 460px;
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
      letter-spacing: 0.1em;
      color: var(--nx-text-dim);
      opacity: 0.7;
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

    .icons {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .icon-option {
      width: 38px;
      height: 38px;
      display: grid;
      place-items: center;
      border-radius: var(--nx-r-2);
      border: 1px solid var(--nx-line-strong);
      background: var(--nx-surface-1);
      color: var(--nx-text-mute);
      cursor: pointer;
      transition: all 140ms var(--nx-ease-out);
    }

    .icon-option:hover {
      color: var(--nx-text);
    }

    .icon-option.selected {
      background: var(--nx-orange-tint);
      border-color: var(--nx-orange-500);
      color: var(--nx-orange-500);
    }

    .switches {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin: 6px 0 4px;
    }

    .switch {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      cursor: pointer;
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

    .btn.danger {
      color: var(--nx-live);
      border-color: rgba(255, 59, 48, 0.35);
    }
  `,
})
export class LinkEditorDialogComponent {
  private readonly fb = inject(FormBuilder);

  /** `null` cria um link novo. */
  readonly link = input<PageLink | null>(null);
  readonly saving = input(false);
  readonly serverError = input<string | null>(null);

  readonly save = output<PageLinkInput>();
  readonly remove = output<string>();
  readonly dismiss = output<void>();

  protected readonly iconOptions = LINK_ICON_OPTIONS;
  protected readonly icon = signal<LinkIconName>('link');
  private readonly localError = signal<string | null>(null);

  protected readonly error = computed(() => this.localError() ?? this.serverError());

  /** Sugestão pré-preenchida chega como link sem id — ainda é criação. */
  protected readonly isEditing = computed(() => !!this.link()?.id);

  protected readonly form = this.fb.nonNullable.group({
    title: ['', Validators.required],
    subtitle: [''],
    url: ['', Validators.required],
    active: [true],
    featured: [false],
    live: [false],
  });

  constructor() {
    effect(() => {
      const link = this.link();
      this.icon.set(link?.icon ?? 'link');
      this.form.reset({
        title: link?.title ?? '',
        subtitle: link?.subtitle ?? '',
        url: link?.url ?? '',
        active: link?.active ?? true,
        featured: link?.featured ?? false,
        live: link?.live ?? false,
      });
    });
  }

  protected submit(): void {
    const value = this.form.getRawValue();
    if (!value.title.trim()) {
      this.localError.set('Informe o título do link.');
      return;
    }
    const urlError = validateLinkUrl(value.url);
    if (urlError) {
      this.localError.set(urlError);
      return;
    }
    this.localError.set(null);
    this.save.emit({ ...value, icon: this.icon() });
  }
}
