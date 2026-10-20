import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { NxInlineMessageComponent } from '../shared/feedback';
import { NxSpinnerComponent } from '../shared/loading/nx-spinner.component';
import { PROFESSOR_REASON_MAX } from './professor-links.model';
import { PfNoteComponent, focusFirst, trapDialogTab } from './ui/professor-ui.components';

/**
 * Confirmação das ações sem volta do professor (encerrar vínculo, cancelar pedido, recusar
 * convite), com motivo opcional. Declarativo como o resto do portal: o chamador renderiza num
 * `@if`, faz a chamada e devolve `busy`/`error` — o erro do servidor aparece aqui, sem fechar.
 */
@Component({
  selector: 'app-professor-confirm-dialog',
  imports: [NxInlineMessageComponent, NxSpinnerComponent, PfNoteComponent],
  template: `
    <div class="pf-backdrop" (click)="dismiss()" aria-hidden="true"></div>
    <div class="pf-dialog" role="alertdialog" aria-modal="true" aria-labelledby="pf-confirm-title">
      <div class="pf-dialog-head">
        <div class="pf-dialog-titles">
          <h2 id="pf-confirm-title" class="pf-dialog-title">{{ heading() }}</h2>
          @if (subtitle(); as sub) {
            <p class="pf-dialog-sub">{{ sub }}</p>
          }
        </div>
        <button type="button" class="pf-dialog-close" aria-label="Fechar" [disabled]="busy()" (click)="dismiss()">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </div>
      <div class="pf-dialog-body">
        <p class="pf-confirm-body">{{ body() }}</p>
        @if (withReason()) {
          <label class="pf-confirm-field">
            <span>{{ reasonLabel() }}</span>
            <textarea
              rows="3"
              [attr.maxlength]="reasonMax"
              [placeholder]="reasonPlaceholder()"
              [value]="reason()"
              [disabled]="busy()"
              (input)="reason.set($any($event.target).value)"
            ></textarea>
          </label>
        }
        @if (note(); as text) {
          <app-pf-note>{{ text }}</app-pf-note>
        }
        @if (error(); as message) {
          <app-nx-inline-message tone="error" heading="Não deu certo" [body]="message" />
        }
      </div>
      <div class="pf-dialog-foot">
        <button type="button" class="pf-btn pf-btn--ghost" [disabled]="busy()" (click)="dismiss()">
          {{ cancelLabel() }}
        </button>
        <button
          type="button"
          class="pf-btn"
          [class.pf-btn--solid-danger]="tone() === 'danger'"
          [class.pf-btn--primary]="tone() === 'primary'"
          [disabled]="busy()"
          (click)="confirm()"
        >
          @if (busy()) {
            <app-nx-spinner [size]="13" [tone]="tone() === 'primary' ? 'dark' : 'orange'" />
          }
          {{ busy() ? busyLabel() : confirmLabel() }}
        </button>
      </div>
    </div>
  `,
  styleUrl: './professor-confirm-dialog.component.scss',
  host: {
    '(keydown.escape)': 'dismiss()',
    '(keydown.tab)': 'onTab($event, false)',
    '(keydown.shift.tab)': 'onTab($event, true)',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfessorConfirmDialogComponent {
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  private readonly trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  readonly heading = input.required<string>();
  readonly subtitle = input<string | null>(null);
  readonly body = input.required<string>();
  readonly note = input<string | null>(null);
  readonly confirmLabel = input.required<string>();
  readonly busyLabel = input('Enviando…');
  readonly cancelLabel = input('Voltar');
  readonly tone = input<'danger' | 'primary'>('danger');
  readonly withReason = input(false);
  readonly reasonLabel = input('Motivo (opcional)');
  readonly reasonPlaceholder = input('Se quiser, conte o motivo para a arena.');
  readonly busy = input(false);
  readonly error = input<string | null>(null);

  readonly confirmed = output<string | null>();
  readonly dismissed = output<void>();

  protected readonly reasonMax = PROFESSOR_REASON_MAX;
  protected readonly reason = signal('');

  constructor() {
    afterNextRender(() => {
      // Ação sem volta: o foco nunca começa no botão de confirmar (Enter não encerra por engano).
      focusFirst(this.host.nativeElement, ['textarea', '.pf-dialog-foot .pf-btn:first-child']);
    });
    inject(DestroyRef).onDestroy(() => this.trigger?.focus());
  }

  protected onTab(event: Event, backward: boolean): void {
    trapDialogTab(event, this.host.nativeElement, backward);
  }

  protected confirm(): void {
    if (this.busy()) return;
    this.confirmed.emit(this.withReason() ? this.reason().trim() || null : null);
  }

  protected dismiss(): void {
    if (this.busy()) return;
    this.dismissed.emit();
  }
}
