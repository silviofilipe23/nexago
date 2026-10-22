import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { CenterContextService } from '../../core/center-context.service';
import { writeErrorMessage } from '../../data/actions/actor';
import { CenterActions } from '../../data/actions/center.actions';
import { CenterStore } from '../../data/center-store.service';
import { formatInstant } from '../../domain/dates';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  EVENT_LABEL,
  EVENT_SPECS,
  REMINDER_LEADS,
  SAMPLE_NOTICES,
  eventGroups,
  settingsChanges,
  settingsError,
  type NotificationEventKey,
  type NotificationSettings,
} from '../../domain/notification-settings';
import { AuditTrailComponent, SegmentedComponent, ToggleComponent } from '../../ui/kit';

/** Configurações › Notificações (protótipo W4b). Só push por enquanto. */
@Component({
  selector: 'ct-notification-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SegmentedComponent, ToggleComponent, AuditTrailComponent],
  template: `
    @if (draft(); as s) {
      <div class="ct-grid-aside">
        <section class="ct-card flush">
          <div class="row head">
            <span class="ct-kick">Evento</span>
            <span class="ct-kick">Quem recebe</span>
            <span class="ct-kick c">Push</span>
            <span class="ct-kick c">E-mail</span>
            <span class="ct-kick c">WhatsApp</span>
          </div>
          @for (g of groups(); track g.title) {
            <div class="group ct-kick">{{ g.title }}</div>
            @for (r of g.rows; track r.key) {
              <div class="row" [class.sel]="selected() === r.key" [class.soon]="!specs[r.key].available">
                <button type="button" class="ev" (click)="selected.set(r.key)">
                  <span class="name">
                    <span class="ct-disp">{{ r.label }}</span>
                    @if (specs[r.key].mandatory) {
                      <span class="ct-tag dim">Obrigatório</span>
                    } @else if (!specs[r.key].available) {
                      <span class="ct-tag dim">Em breve</span>
                    }
                  </span>
                  <span class="ct-mono">{{ r.when }}</span>
                </button>
                <span class="who">{{ r.who }}</span>
                <span class="c">
                  <input
                    type="checkbox"
                    class="chk"
                    [attr.aria-label]="'Push · ' + r.label"
                    [checked]="specs[r.key].available && s.push[r.key]"
                    [disabled]="!editable() || busy() || specs[r.key].mandatory || !specs[r.key].available"
                    (change)="setPush(r.key, $event)"
                  />
                </span>
                <span class="c"><input type="checkbox" class="chk" disabled aria-label="E-mail (em breve)" /></span>
                <span class="c"><input type="checkbox" class="chk" disabled aria-label="WhatsApp (em breve)" /></span>
              </div>
            }
          }
          <p class="ct-dim foot">
            E-mail e WhatsApp chegam quando o NexaGO tiver provedor para eles. Eventos obrigatórios afetam aula ou cobrança e sempre vão por push.
          </p>
        </section>

        <div class="side">
          <section class="ct-card">
            <div class="ct-card-head">
              <div class="ct-grow">
                <div class="ct-kick">{{ label[selected()] }} · push</div>
                <div class="ct-card-title">Pré-visualização</div>
              </div>
            </div>
            <div class="push">
              <div class="ct-mono app">{{ sender() }}</div>
              <div class="ct-disp">{{ sample().title }}</div>
              <div class="ct-muted">{{ sample().body }}</div>
            </div>
            @if (editable()) {
              <div class="actions">
                <button type="button" class="ct-ghost-btn" [disabled]="testing()" (click)="sendTest()">
                  {{ testing() ? 'Enviando…' : 'Enviar teste para mim' }}
                </button>
                @if (testMsg()) {
                  <span class="ct-dim">{{ testMsg() }}</span>
                }
              </div>
            }
          </section>

          <section class="ct-card">
            <div class="ct-card-head">
              <div class="ct-grow">
                <div class="ct-kick">Valem para todos os eventos</div>
                <div class="ct-card-title">Regras gerais</div>
              </div>
            </div>
            <div class="rule">
              <div class="ct-grow">
                <div class="ct-disp">Silêncio</div>
                <div class="ct-dim">Exceto cancelamento e troca de local ou horário · o resto sai quando o silêncio acaba</div>
              </div>
              <ct-toggle label="Horário de silêncio" [on]="s.quietHours.enabled" [disabled]="!editable() || busy()" (onChange)="setQuiet('enabled', $event)" />
            </div>
            @if (s.quietHours.enabled) {
              <div class="times">
                <input class="ct-input mono" type="time" aria-label="Início do silêncio" [value]="s.quietHours.start" [disabled]="!editable() || busy()" (change)="setQuiet('start', value($event))" />
                <span class="ct-mono">até</span>
                <input class="ct-input mono" type="time" aria-label="Fim do silêncio" [value]="s.quietHours.end" [disabled]="!editable() || busy()" (change)="setQuiet('end', value($event))" />
              </div>
            }
            <div class="rule">
              <div class="ct-grow">
                <div class="ct-disp">Lembrete de aula</div>
                <div class="ct-dim">Antecedência do aviso ao aluno</div>
              </div>
              <ct-segmented [options]="leadOptions" [value]="'' + s.reminderLeadMin" [disabled]="!editable() || busy()" (valueChange)="setLead($event)" />
            </div>
            <div class="ct-kv"><span>Remetente</span><span>{{ sender() }}</span></div>
            <div class="ct-kv"><span>Avisos de aula</span><span>O aluno pode desligar no cadastro</span></div>
            <div class="ct-kv"><span>Aluno menor</span><span>Vai para a conta vinculada ao aluno</span></div>
            <div class="ct-kv mono"><span>WhatsApp</span><span>Em breve · só com opt-in</span></div>

            @if (editable()) {
              <div class="save">
                <button type="button" class="ct-mini-btn ct-mini-btn-primary" [disabled]="busy() || changes().length === 0 || !!invalid()" (click)="save()">
                  {{ busy() ? 'Salvando…' : 'Salvar alterações' }}
                </button>
                @if (changes().length) {
                  <button type="button" class="ct-ghost-btn" [disabled]="busy()" (click)="discard()">Descartar</button>
                } @else if (saved()) {
                  <span class="ct-dim">Salvo.</span>
                }
              </div>
              @if (err() || invalid()) {
                <p class="ct-error-text" role="alert">{{ err() || invalid() }}</p>
              }
            }
          </section>

          @if (ctx.isManager() && audit().length) {
            <section class="ct-card"><ct-audit-trail [rows]="audit()" /></section>
          }
        </div>
      </div>
    }
  `,
  styles: `
    .row { display: grid; grid-template-columns: minmax(0, 1fr) 130px 56px 56px 72px; gap: 12px; align-items: center; padding: 6px 18px; border-bottom: 1px solid var(--nx-line); }
    .row.head { padding: 14px 18px 10px; }
    .row.sel { background: rgba(255, 106, 26, 0.06); }
    .row.soon .ev { opacity: 0.55; }
    .c { justify-self: center; text-align: center; }
    .group { padding: 10px 18px 2px; color: var(--nx-orange-400); }
    .ev { all: unset; cursor: pointer; display: flex; flex-direction: column; gap: 2px; min-width: 0; padding: 4px 0; }
    .ev:focus-visible { outline: 2px solid var(--nx-orange-500); outline-offset: 2px; border-radius: 4px; }
    .name { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
    .who { font-size: 12px; color: var(--nx-text-dim); }
    .chk { width: 18px; height: 18px; accent-color: var(--nx-orange-500); cursor: pointer; }
    .chk:disabled { cursor: default; opacity: 0.6; }
    .foot { margin: 0; padding: 12px 18px 16px; line-height: 1.45; }
    .side { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
    .push { padding: 14px; border-radius: var(--nx-r-3); background: var(--nx-surface-1); border: 1px solid var(--nx-line-strong); display: flex; flex-direction: column; gap: 6px; }
    .app { font-size: 10px; letter-spacing: 0.06em; text-transform: uppercase; }
    .actions, .save { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-top: 12px; }
    .rule { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-top: 1px solid var(--nx-line); flex-wrap: wrap; }
    .rule .ct-grow { min-width: 180px; }
    .rule .ct-dim { margin-top: 2px; }
    .times { display: flex; align-items: center; gap: 8px; padding-bottom: 12px; }
    .times .ct-input { width: 110px; height: 36px; }
    @media (max-width: 720px) {
      .row { grid-template-columns: minmax(0, 1fr) 44px 44px 44px; }
      .row .who, .row.head > :nth-child(2) { display: none; }
    }
  `,
})
export class NotificationSettingsComponent {
  readonly editable = input(false);

  protected readonly ctx = inject(CenterContextService);
  private readonly store = inject(CenterStore);
  private readonly actions = inject(CenterActions);

  protected readonly specs = EVENT_SPECS;
  protected readonly label = EVENT_LABEL;
  protected readonly leadOptions = REMINDER_LEADS.map((m) => ({ value: String(m), label: `${m / 60}h` }));

  private readonly key = computed(() => JSON.stringify(this.ctx.center()?.notifications ?? DEFAULT_NOTIFICATION_SETTINGS));
  protected readonly draft = linkedSignal<string, NotificationSettings>({
    source: this.key,
    computation: (k) => JSON.parse(k) as NotificationSettings,
  });
  protected readonly selected = signal<NotificationEventKey>('billing_overdue');
  protected readonly busy = signal(false);
  protected readonly err = signal('');
  protected readonly saved = signal(false);
  protected readonly testing = signal(false);
  protected readonly testMsg = signal('');

  protected readonly changes = computed(() => settingsChanges(JSON.parse(this.key()) as NotificationSettings, this.draft()));
  protected readonly invalid = computed(() => settingsError(this.draft()));
  protected readonly sender = computed(() => `${this.ctx.center()?.name ?? 'Centro'} via NexaGO`);
  protected readonly sample = computed(() => SAMPLE_NOTICES[this.selected()]);

  protected readonly groups = computed(() => {
    const c = this.ctx.center();
    return eventGroups({
      reminderLeadMin: this.draft().reminderLeadMin,
      waitlistAcceptHours: c?.policies.waitlistAcceptHours ?? 24,
      blockAfterDays: c?.billing.blockAfterDays ?? 20,
    });
  });

  protected readonly audit = computed(() => {
    const tz = this.ctx.center()?.timezone;
    return this.store
      .audit()
      .filter((a) => a.action === 'center.notifications')
      .map((a) => ({ when: formatInstant(a.at, tz), who: a.actorName, what: a.detail }));
  });

  protected setPush(key: NotificationEventKey, ev: Event): void {
    const on = (ev.target as HTMLInputElement).checked;
    this.saved.set(false);
    this.selected.set(key);
    this.draft.update((s) => ({ ...s, push: { ...s.push, [key]: on } }));
  }

  protected setQuiet(field: 'enabled' | 'start' | 'end', value: boolean | string): void {
    this.saved.set(false);
    this.draft.update((s) => ({ ...s, quietHours: { ...s.quietHours, [field]: value } }));
  }

  protected setLead(value: string): void {
    this.saved.set(false);
    this.draft.update((s) => ({ ...s, reminderLeadMin: Number(value) }));
  }

  protected value(ev: Event): string {
    return (ev.target as HTMLInputElement).value;
  }

  protected discard(): void {
    this.draft.set(JSON.parse(this.key()) as NotificationSettings);
    this.err.set('');
  }

  protected async save(): Promise<void> {
    if (!this.editable() || this.busy() || this.invalid() || this.changes().length === 0) {
      return;
    }
    this.busy.set(true);
    this.err.set('');
    try {
      await this.actions.updateNotifications(JSON.parse(this.key()) as NotificationSettings, this.draft());
      this.saved.set(true);
    } catch (e) {
      this.err.set(writeErrorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  protected async sendTest(): Promise<void> {
    this.testing.set(true);
    this.testMsg.set('');
    try {
      const r = await this.actions.sendTestNotification(this.selected());
      this.testMsg.set(r.sent ? 'Enviado para o seu app NexaGO.' : 'Não foi possível entregar: seu app NexaGO está com notificações ligadas?');
    } catch (e) {
      this.testMsg.set(writeErrorMessage(e));
    } finally {
      this.testing.set(false);
    }
  }
}
