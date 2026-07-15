import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { OgIconComponent } from './icon.component';

/** Card de categoria dentro dos wizards (nome, tags, vagas/preço/formato). */
@Component({
  selector: 'og-category-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OgIconComponent],
  host: {
    class: 'og-category-card',
    '[class.highlight]': 'highlight()',
  },
  template: `
    <div style="flex:1;min-width:0">
      <div class="og-category-card-name">{{ name() }}</div>
      <div class="og-tag-row" style="margin-top:8px">
        @for (t of tags(); track t) {
          <span class="og-tag">{{ t }}</span>
        }
      </div>
    </div>
    <div class="og-category-card-meta">
      <div class="og-category-card-meta-item">
        <div class="og-category-card-meta-label">Vagas</div>
        <div class="og-category-card-meta-value">{{ vagas() }}</div>
      </div>
      <div class="og-category-card-meta-item">
        <div class="og-category-card-meta-label">Preço</div>
        <div class="og-category-card-meta-value">{{ price() }}</div>
      </div>
      <div class="og-category-card-meta-item">
        <div class="og-category-card-meta-label">Formato</div>
        <div class="og-category-card-meta-value">{{ format() }}</div>
      </div>
    </div>
    <button type="button" class="og-ghost-btn"><og-icon name="edit" [size]="13" />Editar</button>
  `,
})
export class OgCategoryCardComponent {
  readonly name = input.required<string>();
  readonly tags = input<string[]>([]);
  readonly vagas = input.required<string>();
  readonly price = input.required<string>();
  readonly format = input.required<string>();
  readonly highlight = input(false);
}
