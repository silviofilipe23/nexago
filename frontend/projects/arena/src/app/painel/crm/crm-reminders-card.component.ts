import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { REMINDER_OPTIONS, type ReminderSettings } from './crm.model';
import { CrmUiService } from './crm-ui.service';
import { CrmStore } from './crm.store';

/** Lembretes automáticos (push ao mensalista + resumo do dia ao time): interruptores e efeito em 7 dias. */
@Component({
  selector: 'ar-crm-reminders-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./crm.scss'],
  template: `
    @if (store.overview(); as o) {
      <section class="card" aria-labelledby="rem-t">
        <div class="head">
          <h2 class="card-title" id="rem-t">Lembretes automáticos</h2>
          <span class="label">{{ o.reminders.sent7d }} em 7 dias</span>
        </div>
        <p class="card-desc">Push no app do mensalista, todo dia às 9h. Só para quem tem conta no app.</p>

        @if (o.reminders.sent7d > 0) {
          <div class="stats">
            <div class="st"><div class="label">Pagaram</div><div class="st-v good">{{ ratio(o.reminders.paid) }}</div></div>
            <div class="st"><div class="label">Renovaram</div><div class="st-v">{{ ratio(o.reminders.renewed) }}</div></div>
            <div class="st"><div class="label">Voltaram</div><div class="st-v">{{ ratio(o.reminders.cameBack) }}</div></div>
          </div>
        }

        @for (opt of options; track opt.id) {
          <div class="tg">
            <div>
              <div class="tg-t">{{ opt.title }}</div>
              <div class="sub">{{ opt.desc }}</div>
              <div class="when">@for (w of opt.when; track w) { <span>{{ w }}</span> }</div>
            </div>
            <button type="button" class="switch" role="switch" [class.on]="settings()[opt.id]" [attr.aria-checked]="settings()[opt.id]"
              [attr.aria-label]="opt.title" [disabled]="!ui.canWrite() || busy()" (click)="toggle(opt.id)"></button>
          </div>
        }
        <p class="sub foot">Assinantes dos Planos de horário já recebem os lembretes da cobrança deles.</p>
      </section>
    }
  `,
  styles: `
    .head { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
    .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 14px; }
    .st { background: var(--nx-surface-1); border-radius: 10px; padding: 10px 12px; }
    .st-v { font-family: var(--nx-font-display); font-weight: 700; font-size: 17px; margin-top: 3px; color: var(--nx-text); }
    .tg { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; padding: 13px 0; border-top: 1px solid var(--nx-line); }
    .tg:first-of-type { margin-top: 10px; }
    .tg-t { font-size: 13px; font-weight: 600; color: var(--nx-text); }
    .when { display: flex; gap: 6px; margin-top: 7px; flex-wrap: wrap; }
    .when span { font-family: var(--nx-font-mono); font-size: 10px; color: var(--nx-orange-400); background: rgba(255,106,26,.08); border: 1px solid rgba(255,106,26,.3); padding: 2px 7px; border-radius: 6px; }
    .switch { width: 42px; height: 24px; border-radius: 999px; background: var(--nx-surface-2); border: 1px solid var(--nx-line-strong); position: relative; flex: none; padding: 0; cursor: pointer; margin-top: 2px; }
    .switch::after { content: ''; position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%; background: var(--nx-text-mute); transition: left 140ms; }
    .switch.on { background: var(--nx-orange-500); border-color: var(--nx-orange-500); }
    .switch.on::after { left: 21px; background: var(--nx-text-on-orange); }
    .switch:disabled { cursor: default; opacity: .7; }
    .foot { margin-top: 10px; }
  `,
})
export class CrmRemindersCardComponent {
  protected readonly store = inject(CrmStore);
  protected readonly ui = inject(CrmUiService);
  protected readonly options = REMINDER_OPTIONS;
  protected readonly busy = signal(false);

  /** Otimista: o interruptor muda na hora e volta se o servidor recusar. */
  private readonly pending = signal<ReminderSettings | null>(null);
  protected readonly settings = computed<ReminderSettings>(
    () => this.pending() ?? this.store.overview()?.settings.reminders ?? { due: true, overdue: true, renewal: true, absence: true, teamDigest: true },
  );

  protected ratio(r: { done: number; total: number }): string {
    return r.total ? `${r.done} de ${r.total}` : '—';
  }

  protected async toggle(id: keyof ReminderSettings): Promise<void> {
    const next = { ...this.settings(), [id]: !this.settings()[id] };
    this.pending.set(next);
    this.busy.set(true);
    try {
      await this.store.saveReminders(next);
      this.ui.flash(next[id] ? 'Lembrete ligado.' : 'Lembrete desligado.');
    } catch (err) {
      this.pending.set(null);
      this.ui.flash(err instanceof Error ? err.message : 'Não foi possível salvar.');
    } finally {
      this.busy.set(false);
    }
  }
}
