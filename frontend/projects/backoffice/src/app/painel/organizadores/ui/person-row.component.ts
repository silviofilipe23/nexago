import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { PillComponent } from '../../ui/pill.component';
import { initialsOf } from '../organizadores.data';

/** Linha de pessoa (busca de conta e etapa "Conta" dos fluxos de role). */
@Component({
  selector: 'bo-person-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PillComponent],
  template: `
    <div class="row" [class.highlight]="highlight()" [class.lg]="size() === 'lg'">
      <div class="avatar" aria-hidden="true">{{ initials() }}</div>
      <div class="body">
        <div class="line">
          <span class="name">{{ name() }}</span>
          @if (badge()) {
            <bo-pill tone="dim">{{ badge() }}</bo-pill>
          }
        </div>
        @if (meta()) {
          <div class="meta">{{ meta() }}</div>
        }
      </div>
      <ng-content />
    </div>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }

    .row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 0;
      min-width: 0;
    }

    .row.highlight {
      background: var(--nx-orange-tint);
      border: 1px solid rgba(255, 106, 26, 0.28);
      border-radius: var(--nx-r-3);
      padding: 10px 14px;
    }

    .row.lg {
      padding: 12px 14px;
      gap: 14px;
    }

    .avatar {
      width: 36px;
      height: 36px;
      flex: none;
      border-radius: 50%;
      background: var(--nx-orange-tint);
      border: 1px solid rgba(255, 106, 26, 0.35);
      display: grid;
      place-items: center;
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 12px;
      color: var(--nx-orange-500);
    }

    .row.lg .avatar {
      width: 42px;
      height: 42px;
      font-size: 14px;
      box-shadow: 0 0 0 3px rgba(255, 106, 26, 0.12);
    }

    .body {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }

    .line {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }

    .name {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13.5px;
      color: var(--nx-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .row.lg .name {
      font-weight: 700;
      font-size: 14.5px;
    }

    .meta {
      font-family: var(--nx-font-mono);
      font-size: 10px;
      color: var(--nx-text-dim);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  `,
})
export class PersonRowComponent {
  readonly name = input.required<string>();
  readonly badge = input('');
  readonly meta = input('');
  readonly size = input<'md' | 'lg'>('md');
  readonly highlight = input(false);

  protected readonly initials = computed(() => initialsOf(this.name()));
}
