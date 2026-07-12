import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  selector: 'co-tabs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tabs">
      @for (t of tabs(); track t) {
        <button type="button" [class.active]="t === active()" (click)="change.emit(t)">{{ t }}</button>
      }
    </div>
  `,
  styles: `
    .tabs {
      display: flex;
      gap: 2px;
      padding: 3px;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-2);
    }
    button {
      height: 26px;
      padding: 0 12px;
      border-radius: 7px;
      border: none;
      cursor: pointer;
      background: transparent;
      color: var(--nx-text-dim);
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 11.5px;
    }
    button.active {
      background: var(--nx-surface-2);
      color: var(--nx-text);
    }
  `,
})
export class TabsComponent {
  readonly tabs = input.required<string[]>();
  readonly active = input.required<string>();
  readonly change = output<string>();
}
