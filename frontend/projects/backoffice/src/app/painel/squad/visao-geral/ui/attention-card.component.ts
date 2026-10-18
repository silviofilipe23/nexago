import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../../../ui/icon.component';
import { PanelCardComponent } from '../../../ui/panel-card.component';
import type { AttentionItem } from '../data/overview';

export const ATTENTION_LIMIT = 5;

/** "Precisa de atenção": repasse, promoções, risco, candidaturas e aditivos — cada um leva à tela que resolve. */
@Component({
  selector: 'bo-attention-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelCardComponent, IconComponent, RouterLink],
  template: `
    <bo-panel-card title="Precisa de atenção">
      @if (items().length === 0) {
        <div class="empty"><bo-icon name="check" [size]="18" /><span>Nada pendente agora.</span></div>
      }
      @for (it of shown(); track it.key) {
        <div class="item">
          <span class="ic" [class.red]="it.tone === 'red'"><bo-icon [name]="it.icon" [size]="15" /></span>
          <span class="text">
            <strong>{{ it.title }}</strong>
            <span>{{ it.sub }}</span>
          </span>
          <a class="go" [routerLink]="it.route">{{ it.action }}</a>
        </div>
      }
      @if (hidden() > 0) {
        <span class="more">e mais {{ hidden() }} {{ hidden() === 1 ? 'item' : 'itens' }}</span>
      }
    </bo-panel-card>
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .empty { display: flex; align-items: center; gap: 10px; padding: 18px 0; font-size: 13px; color: var(--nx-text-dim); }
    .empty bo-icon { color: var(--nx-win); }
    .item { display: flex; align-items: center; gap: 12px; padding: 10px 0; }
    .item + .item { border-top: 1px solid var(--nx-line); }
    .ic { width: 32px; height: 32px; flex: none; display: grid; place-items: center; border-radius: 9px; background: var(--nx-orange-tint); color: var(--nx-orange-500); }
    .ic.red { background: rgba(255, 59, 48, 0.12); color: var(--nx-live); }
    .text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
    .text strong { font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .text span { font-size: 11.5px; color: var(--nx-text-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .go { flex: none; font-size: 12px; font-weight: 600; color: var(--nx-orange-500); text-decoration: none; white-space: nowrap; }
    .go:hover { text-decoration: underline; }
    .more { display: block; padding-top: 8px; border-top: 1px solid var(--nx-line); font-size: 12px; color: var(--nx-text-dim); }
  `,
})
export class AttentionCardComponent {
  readonly items = input.required<AttentionItem[]>();
  protected readonly shown = computed(() => this.items().slice(0, ATTENTION_LIMIT));
  protected readonly hidden = computed(() => Math.max(0, this.items().length - ATTENTION_LIMIT));
}
