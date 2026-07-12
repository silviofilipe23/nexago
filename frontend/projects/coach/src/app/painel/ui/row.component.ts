import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Linha genérica avatar + título/sub + trailing (protótipo TrRow). Avatar e trailing são projetados. */
@Component({
  selector: 'co-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="row" [class.last]="last()">
      <ng-content select="[row-avatar]" />
      <div class="body">
        <div class="title">{{ title() }}</div>
        @if (sub()) {
          <div class="sub">{{ sub() }}</div>
        }
      </div>
      <ng-content select="[row-trailing]" />
    </div>
  `,
  styles: `
    .row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 11px 0;
      border-bottom: 1px solid var(--nx-line);
    }
    .row.last {
      border-bottom: none;
    }
    .body {
      flex: 1;
      min-width: 0;
    }
    .title {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13px;
      color: var(--nx-text);
    }
    .sub {
      font-family: var(--nx-font-ui);
      font-size: 11.5px;
      color: var(--nx-text-dim);
      margin-top: 2px;
    }
  `,
})
export class RowComponent {
  readonly title = input.required<string>();
  readonly sub = input('');
  readonly last = input(false);
}
