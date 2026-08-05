import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { PanelCardComponent } from '../../ui/panel-card.component';
import type { SummaryRow } from '../role-form.state';

const ROLE_EFFECTS: readonly string[] = [
  'O atleta recebe notificação no app e por e-mail',
  'O modo organizador aparece na troca de papel do app',
  'Os 3 primeiros torneios passam por revisão do backoffice antes de publicar',
  'Tudo fica registrado no log de auditoria',
];

/** Coluna lateral dos fluxos de role: resumo, ações (projetadas) e efeitos da atribuição. */
@Component({
  selector: 'bo-role-rail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelCardComponent],
  template: `
    <bo-panel-card pad="sm" title="Resumo">
      <div>
        @for (row of rows(); track row.label) {
          <div class="summary-row">
            <span class="k">{{ row.label }}</span>
            <span class="v" [class]="row.tone ? 'tone-' + row.tone : ''">{{ row.value }}</span>
          </div>
        }
      </div>
    </bo-panel-card>

    <bo-panel-card pad="sm">
      <div class="actions">
        <ng-content />
      </div>
      @if (note()) {
        <p class="bo-rail-note">{{ note() }}</p>
      }
    </bo-panel-card>

    <bo-panel-card pad="sm" title="Ao atribuir a role">
      <ul class="effects">
        @for (effect of effects; track effect) {
          <li>{{ effect }}</li>
        }
      </ul>
    </bo-panel-card>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 16px;
      min-width: 0;
    }

    .summary-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 9px 0;
      border-bottom: 1px solid var(--nx-line);
    }

    .summary-row:first-child {
      padding-top: 0;
    }

    .summary-row:last-child {
      border-bottom: none;
      padding-bottom: 0;
    }

    .k {
      flex: 1;
      min-width: 0;
      font-size: 12px;
      color: var(--nx-text-dim);
    }

    .v {
      flex: none;
      max-width: 60%;
      text-align: right;
      font-family: var(--nx-font-mono);
      font-size: 11.5px;
      font-weight: 600;
      color: var(--nx-text);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .v.tone-green {
      color: var(--nx-win);
    }

    .v.tone-orange {
      color: var(--nx-orange-500);
    }

    .actions {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-bottom: 14px;
    }

    .effects {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .effects li {
      position: relative;
      padding-left: 15px;
      font-size: 12px;
      line-height: 1.5;
      color: var(--nx-text-mute);
    }

    .effects li::before {
      content: '';
      position: absolute;
      left: 0;
      top: 7px;
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: var(--nx-orange-500);
    }
  `,
})
export class RoleRailComponent {
  readonly rows = input.required<readonly SummaryRow[]>();
  readonly note = input('');

  protected readonly effects = ROLE_EFFECTS;
}
