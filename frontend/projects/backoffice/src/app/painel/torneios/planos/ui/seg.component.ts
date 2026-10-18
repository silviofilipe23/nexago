import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/** Escolha única em botões colados (status, cancelamento, quando publicar). */
@Component({
  selector: 'bo-seg',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="seg" role="radiogroup" [attr.aria-label]="label()">
      @for (o of options(); track o[0]) {
        <button
          type="button"
          role="radio"
          [attr.aria-checked]="value() === o[0]"
          [class.on]="value() === o[0]"
          [disabled]="disabled()"
          (click)="valueChange.emit(o[0])"
        >
          {{ o[1] }}
        </button>
      }
    </div>
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .seg { display: flex; gap: 2px; padding: 3px; border-radius: var(--nx-r-2); background: var(--nx-surface-1); border: 1px solid var(--nx-line); }
    button { flex: 1; min-width: 0; min-height: 34px; padding: 4px 8px; border: none; border-radius: 7px; background: transparent; color: var(--nx-text-mute); font-family: var(--nx-font-display); font-weight: 600; font-size: 12.5px; cursor: pointer; line-height: 1.25; }
    button:hover:not(:disabled):not(.on) { color: var(--nx-text); }
    button.on { background: var(--nx-surface-2); color: var(--nx-text); box-shadow: inset 0 0 0 1px var(--nx-line-strong); }
    button:disabled { cursor: default; }
  `,
})
export class SegComponent<T extends string = string> {
  readonly options = input.required<ReadonlyArray<readonly [T, string]>>();
  readonly value = input.required<T>();
  readonly label = input.required<string>();
  readonly disabled = input(false);

  readonly valueChange = output<T>();
}
