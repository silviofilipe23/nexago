import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { NxFeedbackIconComponent } from './nx-feedback-icon.component';
import type { NxFeedbackTone } from './nx-feedback.types';

/** Mensagem colada ao conteúdo que ela descreve — topo de um card ou de um
 *  formulário (design 12, coluna "Inline").
 *
 *  É a superfície certa pra erro de envio ("não deu pra salvar seu perfil") e
 *  pra aviso preso a um contexto ("restam 3 vagas na sua categoria"): fica na
 *  tela, não some sozinha e mora ao lado do que precisa de conserto. Erro de
 *  UM campo específico não usa isto — usa `app-nx-field-error`.
 *
 *  O corpo pode vir por projeção quando o texto tem marcação; caso contrário,
 *  use `[body]`. */
@Component({
  selector: 'app-nx-inline-message',
  imports: [NxFeedbackIconComponent],
  template: `
    <app-nx-feedback-icon [tone]="tone()" [size]="17" />

    <div class="content">
      <div class="title">{{ heading() }}</div>

      @if (body(); as text) {
        <p class="body">{{ text }}</p>
      }
      <ng-content />

      @if (actionLabel(); as label) {
        <div class="actions">
          <button type="button" class="action" (click)="action.emit()">{{ label }}</button>
        </div>
      }
    </div>
  `,
  styles: `
      :host {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        padding: 13px 14px;
        background: var(--tone-wash);
        border: 1px solid var(--tone-line);
        border-radius: var(--nx-r-3);
      }

      app-nx-feedback-icon {
        color: var(--tone);
        margin-top: 1px;
      }

      .content {
        flex: 1;
        min-width: 0;
      }

      .title {
        font-family: var(--nx-font-display);
        font-size: 13px;
        font-weight: 700;
        line-height: 1.3;
        color: var(--tone);
      }

      .body {
        margin: 4px 0 0;
        font-family: var(--nx-font-ui);
        font-size: 12px;
        line-height: 18px;
        color: var(--nx-text-mute);
      }

      .actions {
        margin-top: 10px;
      }

      .action {
        display: inline-block;
        padding: 6px 11px;
        background: var(--tone-fill);
        border: 1px solid var(--tone-line);
        border-radius: var(--nx-r-1);
        color: var(--tone);
        font-family: var(--nx-font-display);
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: background var(--nx-d-fast) var(--nx-ease-out);
      }

      .action:hover {
        background: rgb(var(--tone-rgb) / 0.24);
      }
  `,
  host: {
    '[attr.role]': 'tone() === "error" ? "alert" : "status"',
    '[class.nx-tone-info]': 'tone() === "info"',
    '[class.nx-tone-success]': 'tone() === "success"',
    '[class.nx-tone-error]': 'tone() === "error"',
    '[class.nx-tone-warning]': 'tone() === "warning"',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxInlineMessageComponent {
  readonly tone = input<NxFeedbackTone>('error');
  /** Renomeado de `title` pra não virar atributo HTML nativo (tooltip). */
  readonly heading = input.required<string>();
  readonly body = input<string | null>(null);
  readonly actionLabel = input<string | null>(null);

  readonly action = output<void>();
}
