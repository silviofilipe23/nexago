import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { activityOf, timelineOf, type Order } from '../data/order';

/** Histórico do pedido (03): etapas da modalidade + atividade avulsa (remessa, reembolso, avisos). */
@Component({
  selector: 'bo-order-timeline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2>Histórico</h2>
    <ol class="steps">
      @for (s of steps(); track $index; let last = $last) {
        <li [class]="s.state" [class.last]="last">
          <span class="dot" aria-hidden="true"></span>
          <span class="text">
            <span class="title">{{ s.title }}</span>
            @if (s.detail) { <span class="detail">{{ s.detail }}</span> }
          </span>
          <span class="sr">{{ stateLabel(s.state) }}</span>
        </li>
      }
    </ol>
    @if (activity().length > 0) {
      <div class="kicker">Atividade</div>
      <ul class="activity">
        @for (a of activity(); track $index) {
          <li><strong>{{ a.title }}</strong>@if (a.detail) { <span> · {{ a.detail }}</span> }</li>
        }
      </ul>
    }
  `,
  styles: `
    :host { display: block; padding: 20px 22px; background: var(--nx-surface-0); border: 1px solid var(--nx-line); border-radius: var(--nx-r-4); }
    h2 { margin: 0 0 14px; font-family: var(--nx-font-display); font-weight: 800; font-size: 15px; }
    .steps { list-style: none; margin: 0; padding: 0; }
    .steps li { position: relative; display: flex; gap: 14px; padding-bottom: 14px; }
    .steps li.last { padding-bottom: 0; }
    .dot { position: relative; z-index: 1; flex: none; width: 14px; height: 14px; margin-top: 2px; border-radius: 50%; border: 2px solid var(--nx-line-strong); background: var(--nx-surface-0); }
    /* Linha até o próximo ponto: verde depois de uma etapa concluída, cinza nas demais. */
    .steps li:not(.last)::before { content: ''; position: absolute; left: 6px; top: 16px; bottom: -2px; width: 2px; background: var(--nx-line-strong); }
    .steps li.done:not(.last)::before { background: var(--nx-win); }
    .done .dot { border-color: var(--nx-win); background: var(--nx-win); }
    .current .dot { border-color: var(--nx-orange-500); background: var(--nx-orange-500); box-shadow: 0 0 0 4px rgba(255, 106, 26, 0.18); }
    .canceled .dot { border-color: var(--nx-live); background: var(--nx-live); }
    .text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .title { font-family: var(--nx-font-display); font-weight: 700; font-size: 13px; }
    .next .title { color: var(--nx-text-dim); font-weight: 600; }
    .canceled .title { color: var(--nx-live); }
    .detail { font-size: 11.5px; color: var(--nx-text-dim); }
    .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
    .kicker { margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--nx-line); font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    .activity { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 6px; font-size: 11.5px; color: var(--nx-text-dim); }
    .activity strong { color: var(--nx-text-mute); font-weight: 600; }
  `,
})
export class OrderTimelineComponent {
  readonly order = input.required<Order>();
  protected readonly steps = computed(() => timelineOf(this.order()));
  protected readonly activity = computed(() => activityOf(this.order()));

  protected stateLabel(s: string): string {
    return s === 'done' ? '(concluído)' : s === 'current' ? '(etapa atual)' : s === 'canceled' ? '(cancelado)' : '(próxima)';
  }
}
