import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { PanelCardComponent } from '../../../ui/panel-card.component';
import { brl } from '../../comissoes/data/commission';
import type { ConversionLine } from '../data/profile';

export const CONVERSIONS_PREVIEW = 8;

/** Inscrições atribuídas ao embaixador, mais recentes primeiro, com o status da comissão. */
@Component({
  selector: 'bo-conversions-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelCardComponent],
  template: `
    <bo-panel-card title="Conversões">
      @if (lines().length > preview) {
        <button card-actions type="button" class="action" (click)="all.set(!all())">
          {{ all() ? 'Mostrar menos' : 'Ver todas · ' + lines().length }}
        </button>
      }
      @if (lines().length === 0) {
        <p class="empty">Nenhuma inscrição com o código, link ou QR ainda.</p>
      } @else {
        <div class="table" role="table" aria-label="Conversões">
          <div class="row head" role="row">
            <span role="columnheader">Data</span>
            <span role="columnheader">Atleta</span>
            <span role="columnheader">Inscrição</span>
            <span role="columnheader">Origem</span>
            <span role="columnheader">Valor</span>
            <span role="columnheader">Comissão</span>
            <span role="columnheader">Status</span>
          </div>
          @for (l of shown(); track l.id) {
            <div class="row" role="row">
              <span role="cell" class="dim">{{ l.when }}</span>
              <span role="cell" class="strong ellipsis" [title]="l.athlete">{{ l.athlete }}</span>
              <span role="cell" class="mute ellipsis" [title]="l.registration">{{ l.registration }}</span>
              <span role="cell" class="dim">{{ l.origin }}</span>
              <span role="cell" class="mono">{{ money(l.grossCents) }}</span>
              <span role="cell" class="mono" [class.dim]="l.canceled">{{ money(l.amountCents) }}</span>
              <span role="cell" class="status" [class]="'status ' + l.tone" [title]="l.status"><i></i><em>{{ l.status }}</em></span>
            </div>
          }
        </div>
      }
    </bo-panel-card>
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .action { padding: 0; border: none; background: none; font-size: 12.5px; font-weight: 600; color: var(--nx-orange-500); cursor: pointer; }
    .action:hover { text-decoration: underline; }
    .empty { margin: 8px 0; font-size: 13px; color: var(--nx-text-dim); }
    .table { overflow-x: auto; margin-bottom: -8px; }
    .row { display: grid; grid-template-columns: 66px minmax(72px, 0.9fr) minmax(0, 1.6fr) 50px 74px 66px minmax(112px, 1.2fr); gap: 10px; align-items: center; min-width: 600px; height: 44px; border-bottom: 1px solid var(--nx-line); font-size: 12.5px; }
    .row:last-child { border-bottom: none; }
    .row.head { height: auto; padding-bottom: 10px; border-bottom: 1px solid var(--nx-line); font-family: var(--nx-font-mono); font-size: 9px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    .dim { color: var(--nx-text-dim); }
    .mute { color: var(--nx-text-mute); }
    .strong { font-weight: 600; }
    .ellipsis { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .mono { font-family: var(--nx-font-mono); font-size: 12.5px; }
    .mono.dim { color: var(--nx-text-dim); }
    .status { display: inline-flex; align-items: center; gap: 6px; min-width: 0; font-size: 12px; font-weight: 600; white-space: nowrap; }
    .status em { font-style: normal; overflow: hidden; text-overflow: ellipsis; }
    .status i { flex: none; width: 6px; height: 6px; border-radius: 99px; background: currentColor; }
    .status.yellow { color: var(--nx-pending); }
    .status.green { color: var(--nx-win); }
    .status.dim { color: var(--nx-text-mute); }
    .status.red { color: var(--nx-live); }
  `,
})
export class ConversionsCardComponent {
  readonly lines = input.required<ConversionLine[]>();
  protected readonly preview = CONVERSIONS_PREVIEW;
  protected readonly all = signal(false);
  protected readonly shown = computed(() => (this.all() ? this.lines() : this.lines().slice(0, CONVERSIONS_PREVIEW)));

  protected money(cents: number): string {
    return brl(cents);
  }
}
