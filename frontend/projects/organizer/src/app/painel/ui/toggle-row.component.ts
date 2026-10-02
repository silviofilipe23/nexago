import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/** Linha título + descrição + switch. Clicar alterna e emite `toggled` com o valor novo —
 *  telas mock antigas que não escutam o output continuam visuais como antes (estado vem só
 *  do input `on`). Com `disabled` o clique não emite e o switch fica apagado. */
@Component({
  selector: 'og-toggle-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'og-toggle-row',
    '(click)': 'onClick()',
    '[style.cursor]': 'disabled() ? "not-allowed" : "pointer"',
    '[class.og-toggle-row-disabled]': 'disabled()',
    '[attr.aria-disabled]': 'disabled() || null',
  },
  template: `
    <div class="og-toggle-row-text">
      <div class="og-toggle-row-title">{{ title() }}</div>
      @if (desc()) {
        <div class="og-toggle-row-desc">{{ desc() }}</div>
      }
    </div>
    <span class="og-toggle" [class.on]="on()"></span>
  `,
  styles: `
    :host(.og-toggle-row-disabled) .og-toggle {
      opacity: 0.45;
      cursor: not-allowed;
    }
  `,
})
export class OgToggleRowComponent {
  readonly title = input.required<string>();
  readonly desc = input<string>('');
  readonly on = input(false);
  readonly disabled = input(false);
  readonly toggled = output<boolean>();

  protected onClick(): void {
    if (this.disabled()) return;
    this.toggled.emit(!this.on());
  }
}
