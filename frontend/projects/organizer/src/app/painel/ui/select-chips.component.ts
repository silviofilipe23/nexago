import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/** Seletor de opção única em chips. Clicar num chip emite `changed` com a opção — telas mock
 *  antigas que não escutam o output continuam visuais como antes. */
@Component({
  selector: 'og-select-chips',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'og-select-chips' },
  template: `
    @for (o of options(); track o) {
      <span class="og-select-chip" [class.active]="o === active()" style="cursor:pointer" (click)="changed.emit(o)">{{ o }}</span>
    }
  `,
})
export class OgSelectChipsComponent {
  readonly options = input.required<string[]>();
  readonly active = input<string>('');
  readonly changed = output<string>();
}
