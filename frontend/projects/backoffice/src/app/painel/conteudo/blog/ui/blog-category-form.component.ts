import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal, untracked } from '@angular/core';
import { FieldComponent } from '../../../ui/field.component';
import { PanelCardComponent } from '../../../ui/panel-card.component';
import { ToggleComponent } from '../../../ui/toggle.component';
import {
  BLOG_CATEGORY_LABEL_MAX,
  CATEGORY_PALETTE,
  categoryErrors,
  categoryIdFrom,
  darkContrast,
  isHexColor,
  lightContrast,
  pairWarnings,
  type BlogCategoryDef,
  type SaveBlogCategoryInput,
} from '../data/blog-taxonomy';

/** O que o formulário devolve; `order` `null` = nova (a página põe depois da última). */
export type CategoryFormValue = Omit<SaveBlogCategoryInput, 'order'> & { order: number | null };

const ratio = (n: number) => `${n.toFixed(1).replace('.', ',')}:1`;

/**
 * Nome, cores (pares prontos ou hex à mão, com o contraste conferido) e situação de uma categoria,
 * com a prévia do chip no escuro e no claro.
 */
@Component({
  selector: 'bo-blog-category-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelCardComponent, FieldComponent, ToggleComponent],
  template: `
    <bo-panel-card pad="sm" [title]="category() ? 'Editar categoria' : 'Nova categoria'" [kicker]="category()?.id ?? (idPreview() || 'id gerado do nome')">
      <div class="stack">
        <bo-field label="Nome" [hint]="label().length + ' de ' + labelMax">
          <input class="bo-input" placeholder="Ex.: Saúde & corpo" [attr.maxlength]="labelMax" [value]="label()" [disabled]="saving()" (input)="label.set(value($event))" />
        </bo-field>

        <div class="group">
          <span class="caption">Cores · pares prontos</span>
          <div class="palette" role="radiogroup" aria-label="Pares de cores">
            @for (p of palette; track p.name) {
              <button
                type="button"
                role="radio"
                class="swatch"
                [class.on]="color() === p.color && colorLight() === p.colorLight"
                [attr.aria-checked]="color() === p.color && colorLight() === p.colorLight"
                [attr.aria-label]="p.name"
                [attr.title]="p.name"
                [disabled]="saving()"
                (click)="pick(p.color, p.colorLight)"
              >
                <span class="half" [style.background]="p.color"></span>
                <span class="half" [style.background]="p.colorLight"></span>
              </button>
            }
          </div>
        </div>

        <details class="advanced" [open]="customPair()">
          <summary>Cores avançadas (hex)</summary>
          <div class="two">
            <bo-field label="Tom no escuro" [hint]="isHex(color()) ? ratio(dark()) + ' no fundo escuro' : 'Formato #RRGGBB'">
              <input class="bo-input mono" maxlength="7" [value]="color()" [disabled]="saving()" (input)="color.set(value($event).trim())" />
            </bo-field>
            <bo-field label="Texto no claro" [hint]="isHex(colorLight()) ? ratio(light()) + ' no fundo claro' : 'Formato #RRGGBB'">
              <input class="bo-input mono" maxlength="7" [value]="colorLight()" [disabled]="saving()" (input)="colorLight.set(value($event).trim())" />
            </bo-field>
          </div>
        </details>
        @for (w of warnings(); track w) {
          <p class="warn" role="status">{{ w }}</p>
        }

        <div class="preview" aria-label="Prévia do chip">
          <div class="pane dark">
            <span class="kicker">Escuro</span>
            @if (isHex(color())) {
              <span class="chip" [style.color]="color()" [style.border-color]="color() + '59'" [style.background]="color() + '1a'">{{ label() || 'Categoria' }}</span>
            }
          </div>
          <div class="pane light">
            <span class="kicker">Claro</span>
            @if (isHex(colorLight())) {
              <span class="chip" [style.color]="colorLight()" [style.border-color]="colorLight() + '40'">{{ label() || 'Categoria' }}</span>
            }
          </div>
        </div>

        <div class="toggle-row">
          <span><strong>Ativa</strong><span class="dim">Inativa some do editor e dos filtros do app.</span></span>
          <bo-toggle ariaLabel="Categoria ativa" [checked]="active()" [disabled]="saving()" (checkedChange)="active.set($event)" />
        </div>

        @if (errors().length > 0) {
          <p class="err">{{ errors()[0] }}</p>
        }
        <div class="actions">
          <button type="button" class="bo-mini-btn" [disabled]="saving()" (click)="cancelled.emit()">Cancelar</button>
          <button type="button" class="bo-mini-btn bo-mini-btn-primary" [disabled]="saving() || errors().length > 0" (click)="submit()">
            {{ category() ? 'Salvar' : 'Criar categoria' }}
          </button>
        </div>
      </div>
    </bo-panel-card>
  `,
  styles: `
    .stack { display: flex; flex-direction: column; gap: 14px; }
    .group { display: flex; flex-direction: column; gap: 8px; }
    .caption, .kicker { font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    .palette { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; }
    .swatch { display: flex; height: 30px; padding: 0; border-radius: 8px; border: 2px solid transparent; overflow: hidden; cursor: pointer; background: none; }
    .swatch.on { border-color: var(--nx-text); }
    .swatch:focus-visible { outline: 2px solid var(--nx-orange-500); outline-offset: 2px; }
    .half { flex: 1; }
    .advanced summary { cursor: pointer; font-size: 12.5px; color: var(--nx-text-mute); }
    .advanced .two { margin-top: 10px; }
    .two { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .mono { font-family: var(--nx-font-mono); text-transform: uppercase; }
    .warn { margin: 0; font-size: 12px; line-height: 1.45; color: var(--nx-pending); }
    .err { margin: 0; font-size: 12px; color: var(--nx-live); }
    .preview { display: grid; grid-template-columns: 1fr 1fr; border-radius: var(--nx-r-3); overflow: hidden; border: 1px solid var(--nx-line); }
    .pane { display: flex; flex-direction: column; gap: 8px; padding: 12px; min-height: 64px; }
    .pane.dark { background: #0b0b0c; }
    .pane.light { background: #faf8f4; }
    .pane.light .kicker { color: #6b6b70; }
    .chip { align-self: flex-start; max-width: 100%; display: inline-flex; align-items: center; height: 22px; padding: 0 9px; border-radius: var(--nx-r-pill); border: 1px solid; font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .toggle-row { display: flex; align-items: center; gap: 12px; }
    .toggle-row > span { flex: 1; display: flex; flex-direction: column; gap: 2px; }
    .toggle-row strong { font-family: var(--nx-font-display); font-weight: 600; font-size: 13px; color: var(--nx-text); }
    .dim { font-size: 11.5px; color: var(--nx-text-dim); }
    .actions { display: flex; justify-content: flex-end; gap: 8px; }
  `,
})
export class BlogCategoryFormComponent {
  /** `null` = nova. */
  readonly category = input<BlogCategoryDef | null>(null);
  readonly saving = input(false);
  readonly saved = output<CategoryFormValue>();
  readonly cancelled = output<void>();

  protected readonly labelMax = BLOG_CATEGORY_LABEL_MAX;
  protected readonly palette = CATEGORY_PALETTE;
  protected readonly ratio = ratio;
  protected readonly isHex = isHexColor;

  protected readonly label = signal('');
  protected readonly color = signal(CATEGORY_PALETTE[6]!.color);
  protected readonly colorLight = signal(CATEGORY_PALETTE[6]!.colorLight);
  protected readonly active = signal(true);

  protected readonly idPreview = computed(() => categoryIdFrom(this.label()));
  protected readonly dark = computed(() => (isHexColor(this.color()) ? darkContrast(this.color()) : 0));
  protected readonly light = computed(() => (isHexColor(this.colorLight()) ? lightContrast(this.colorLight()) : 0));
  /** Par fora da paleta: abre as cores avançadas. */
  protected readonly customPair = computed(
    () => !CATEGORY_PALETTE.some((p) => p.color === this.color().toUpperCase() && p.colorLight === this.colorLight().toUpperCase()),
  );
  protected readonly warnings = computed(() => pairWarnings(this.color(), this.colorLight()));
  protected readonly errors = computed(() =>
    categoryErrors({
      id: this.category()?.id ?? null,
      label: this.label(),
      color: this.color(),
      colorLight: this.colorLight(),
      order: this.category()?.order ?? 0,
      active: this.active(),
    }),
  );

  constructor() {
    // Trocar de categoria com o formulário aberto recarrega os campos.
    effect(() => {
      const c = this.category();
      untracked(() => {
        const base = c ?? { label: '', color: CATEGORY_PALETTE[6]!.color, colorLight: CATEGORY_PALETTE[6]!.colorLight, active: true };
        this.label.set(base.label);
        this.color.set(base.color);
        this.colorLight.set(base.colorLight);
        this.active.set(base.active);
      });
    });
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected pick(color: string, colorLight: string): void {
    this.color.set(color);
    this.colorLight.set(colorLight);
  }

  protected submit(): void {
    if (this.errors().length > 0) {
      return;
    }
    const c = this.category();
    this.saved.emit({
      id: c?.id ?? null,
      label: this.label().replace(/\s+/g, ' ').trim(),
      color: this.color().toUpperCase(),
      colorLight: this.colorLight().toUpperCase(),
      order: c ? c.order : null,
      active: this.active(),
    });
  }
}
