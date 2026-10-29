import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
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
      @if (startError(); as msg) {
        <p class="og-wizard-error" style="margin:8px 0 0;font-size:12px">{{ msg }}</p>
      }
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
      @if (start()) {
        <div class="og-category-card-meta-item">
          <div class="og-category-card-meta-label">Início</div>
          <div class="og-category-card-meta-value" [style.color]="startError() ? 'var(--nx-live)' : null">{{ start() }}</div>
        </div>
      }
    </div>
    <button type="button" class="og-ghost-btn" (click)="edit.emit()"><og-icon name="edit" [size]="13" />Editar</button>
    @if (removable()) {
      <button type="button" class="og-ghost-btn" style="color:var(--nx-live)" (click)="remove.emit()">Remover</button>
    }
  `,
})
export class OgCategoryCardComponent {
  readonly name = input.required<string>();
  readonly tags = input<string[]>([]);
  readonly vagas = input.required<string>();
  readonly price = input.required<string>();
  readonly format = input.required<string>();
  /** Início da categoria já formatado; vazio = sem horário próprio (o item some). */
  readonly start = input('');
  /** Início fora do período do torneio (datas mudaram depois): pinta o horário e explica. */
  readonly startError = input<string | null>(null);
  readonly highlight = input(false);
  readonly removable = input(false);
  readonly edit = output<void>();
  readonly remove = output<void>();
}
