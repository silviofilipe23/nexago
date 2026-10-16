import { ChangeDetectionStrategy, Component, DestroyRef, inject, input, signal, type OnInit } from '@angular/core';
import { callableErrorMessage } from '../../../data/callable-error';
import { stamp, type Order } from '../data/order';
import { OrdersRepository } from '../data/orders.repository';

const DEBOUNCE_MS = 900;

/** Nota interna do pedido: grava sozinha ao parar de digitar, com autor e hora. */
@Component({
  selector: 'bo-order-note',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2>Nota interna</h2>
    <textarea class="bo-input" placeholder="Visível só para a equipe…" aria-label="Nota interna"
      [value]="text()" (input)="onInput($event)" (blur)="flush()"></textarea>
    <p class="status" [class.bad]="error()" aria-live="polite">{{ status() }}</p>
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 10px; padding: 18px 20px; background: var(--nx-surface-0); border: 1px solid var(--nx-line); border-radius: var(--nx-r-4); }
    h2 { margin: 0; font-family: var(--nx-font-display); font-weight: 800; font-size: 14px; }
    textarea { height: 92px; padding: 10px 12px; resize: vertical; }
    .status { margin: 0; min-height: 14px; font-size: 11px; color: var(--nx-text-dim); }
    .status.bad { color: var(--nx-live); }
  `,
})
export class OrderNoteComponent implements OnInit {
  private readonly repo = inject(OrdersRepository);

  readonly order = input.required<Order>();

  protected readonly text = signal('');
  protected readonly status = signal('');
  protected readonly error = signal(false);
  private timer: ReturnType<typeof setTimeout> | null = null;
  private saved = '';
  private ready = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.flush());
  }

  /** O pai entrega o pedido depois do primeiro render: semeia o texto uma vez. */
  ngOnInit(): void {
    const note = this.order().internalNote;
    this.saved = note?.text ?? '';
    this.text.set(this.saved);
    this.status.set(note?.at ? `Salvo por ${note.byName} · ${stamp(note.at)}` : '');
    this.ready = true;
  }

  protected onInput(e: Event): void {
    this.text.set((e.target as HTMLTextAreaElement).value);
    this.status.set('Digitando…');
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.save(), DEBOUNCE_MS);
  }

  protected flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
      void this.save();
    }
  }

  private async save(): Promise<void> {
    this.timer = null;
    const text = this.text();
    if (!this.ready || text === this.saved) {
      if (text === this.saved) this.status.set(this.status() === 'Digitando…' ? '' : this.status());
      return;
    }
    this.status.set('Salvando…');
    this.error.set(false);
    try {
      await this.repo.saveNote(this.order().id, text);
      this.saved = text;
      this.status.set(`Salvo · ${stamp(new Date())}`);
    } catch (err) {
      this.error.set(true);
      this.status.set(`Não salvou: ${callableErrorMessage(err)}`);
    }
  }
}
