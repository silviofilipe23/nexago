import { ChangeDetectionStrategy, Component, computed, inject, input, OnInit, output, signal } from '@angular/core';
import { CenterContextService } from '../../core/center-context.service';
import { CenterStore } from '../../data/center-store.service';
import { todayKey, wallClock } from '../../domain/dates';
import { BannerComponent, ModalComponent } from '../../ui/kit';
import { trialErrorMessage } from '../trials/trial-view';
import {
  PERIOD_LABEL,
  dayShort,
  firstName,
  interestLine,
  slotLabel,
  trialSlots,
  whatsAppLink,
  type Lead,
  type LeadPeriod,
  type TrialSlot,
} from './lead-model';
import { LeadsService } from './leads.service';

const PERIODS = Object.entries(PERIOD_LABEL) as [Exclude<LeadPeriod, ''>, string][];

/**
 * C2 — Agendar aula experimental: aulas das próximas 2 semanas na modalidade do interesse, com
 * vagas e experimentais já marcadas (limite por aula em Configurações › Captação). Agenda pela
 * callable (o servidor confere tudo de novo na transação) e oferece o aviso por WhatsApp.
 */
@Component({
  selector: 'ct-schedule-trial',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ModalComponent, BannerComponent],
  template: `
    <ct-modal title="Agendar aula experimental" [kicker]="kicker()" [width]="620" (closed)="closed.emit()">
      @if (done(); as d) {
        <ct-banner tone="green" [inline]="true" title="Experimental agendada">
          {{ firstName(lead().name) }} · {{ d.className }} · {{ dayShort(d.date) }} {{ d.startTime }}. O professor já vê na aula.
        </ct-banner>
      } @else {
        <div class="filters">
          <button type="button" class="ct-chip" [class.active]="!programId()" (click)="programId.set('')">Todas</button>
          @for (p of programs(); track p.id) {
            <button type="button" class="ct-chip" [class.active]="programId() === p.id" (click)="programId.set(p.id)">{{ p.name }}</button>
          }
          <span class="ct-grow"></span>
          @for (p of PERIODS; track p[0]) {
            <button type="button" class="ct-chip" [class.active]="period() === p[0]" (click)="period.set(period() === p[0] ? '' : p[0])">{{ p[1] }}</button>
          }
        </div>
        <div class="slots" role="listbox" aria-label="Aulas">
          @for (s of visible(); track s.sessionId) {
            <button type="button" role="option" class="slot" [class.on]="picked() === s.sessionId" [class.off]="!!s.blocked"
              [attr.aria-selected]="picked() === s.sessionId" [disabled]="!!s.blocked" (click)="picked.set(s.sessionId)">
              <span class="ct-disp d">{{ dayShort(s.date) }}</span>
              <span class="ct-mono t">{{ s.startTime }}</span>
              <span class="cl">
                <span class="ct-disp n">{{ s.className }}</span>
                <span class="ct-dim s">{{ s.coachName ? 'Prof. ' + s.coachName : 'Sem professor' }}{{ s.level ? ' · ' + s.level : '' }}</span>
              </span>
              <span class="ct-mono lb" [class.red]="!!s.blocked">{{ slotLabel(s) }}</span>
            </button>
          } @empty {
            <div class="ct-empty">Nenhuma aula nas próximas 2 semanas{{ programId() || period() ? ' com esse filtro' : '' }}.</div>
          }
        </div>
        <div class="box">
          <div class="ct-kv"><span>Valor</span><span>{{ priceLabel() }}</span></div>
          <div class="ct-kv"><span>O professor vê</span><span>Nome, experiência e objetivo</span></div>
          <div class="ct-kv"><span>Experimentais por pessoa</span><span>{{ perPerson() }}</span></div>
        </div>
        @if (!lead().athleteId) {
          <ct-banner tone="blue" [inline]="true" title="Sem conta NexaGO">
            {{ firstName(lead().name) }} recebe a confirmação pelo WhatsApp. A conta só é criada se se matricular.
          </ct-banner>
        }
      }
      @if (error()) {
        <p class="ct-error-text" role="alert">{{ error() }}</p>
      }
      <ng-container footer>
        @if (done(); as d) {
          <button type="button" class="ct-ghost-btn" (click)="finished.emit()">Fechar</button>
          @if (waLink(d); as link) {
            <a class="ct-mini-btn ct-mini-btn-primary" [href]="link" target="_blank" rel="noopener" (click)="finished.emit()">Avisar por WhatsApp</a>
          }
        } @else {
          <button type="button" class="ct-ghost-btn" (click)="closed.emit()">Cancelar</button>
          <button type="button" class="ct-mini-btn ct-mini-btn-primary" [disabled]="!picked() || busy()" (click)="schedule()">
            {{ busy() ? 'Agendando…' : 'Agendar experimental' }}
          </button>
        }
      </ng-container>
    </ct-modal>
  `,
  styles: `
    .filters { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    .slots { display: flex; flex-direction: column; gap: 6px; max-height: 340px; overflow-y: auto; }
    .slot { display: grid; grid-template-columns: 64px 50px 1fr auto; gap: 12px; align-items: center; padding: 11px 14px; border-radius: var(--nx-r-3);
      background: var(--nx-surface-0); border: 1px solid var(--nx-line); text-align: left; font: inherit; color: var(--nx-text); cursor: pointer; }
    .slot.on { background: rgba(255,106,26,0.08); border-color: var(--nx-orange-500); }
    .slot.off { opacity: 0.45; cursor: default; }
    .d { font-size: 13px; font-weight: 700; } .t { font-size: 12px; font-weight: 700; color: var(--nx-text); }
    .cl { display: flex; flex-direction: column; min-width: 0; } .n { font-size: 13px; font-weight: 600; } .s { font-size: 11px; margin-top: 2px; }
    .lb { font-size: 10px; font-weight: 600; color: var(--nx-text-dim); text-align: right; } .lb.red { color: var(--nx-live); }
    .box { padding: 4px 14px; border-radius: var(--nx-r-3); background: var(--nx-surface-0); border: 1px solid var(--nx-line); }
    .box .ct-kv:first-child { border-top: 0; }
    a.ct-mini-btn { text-decoration: none; }
    @media (max-width: 560px) { .slot { grid-template-columns: 52px 44px 1fr; } .lb { grid-column: 1 / -1; text-align: left; } }
  `,
})
export class ScheduleTrialComponent implements OnInit {
  readonly lead = input.required<Lead>();
  readonly closed = output<void>();
  readonly finished = output<void>();

  private readonly ctx = inject(CenterContextService);
  private readonly store = inject(CenterStore);
  private readonly leads = inject(LeadsService);

  protected readonly PERIODS = PERIODS;
  protected readonly dayShort = dayShort;
  protected readonly slotLabel = slotLabel;
  protected readonly firstName = firstName;

  protected readonly programId = signal('');
  protected readonly period = signal<LeadPeriod>('');
  protected readonly picked = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly done = signal<TrialSlot | null>(null);

  protected readonly kicker = computed(() => `${this.lead().name} · ${interestLine(this.lead())}`);
  protected readonly programs = computed(() => this.store.programs());

  private readonly slots = computed(() => {
    const tz = this.ctx.center()?.timezone;
    return trialSlots(this.store.sessions(), this.store.classes(), this.leads.settings(), todayKey(tz), wallClock(new Date(), tz).time);
  });
  protected readonly visible = computed(() =>
    this.slots().filter((s) => (!this.programId() || s.programId === this.programId()) && (!this.period() || s.period === this.period())),
  );

  protected readonly priceLabel = computed(() => {
    const p = this.ctx.center()?.showcase.trial.priceReais ?? 0;
    return p > 0 ? `R$ ${p.toFixed(2).replace('.', ',')}` : 'Gratuita';
  });
  protected readonly perPerson = computed(() => {
    const max = this.leads.settings().maxTrialsPerPerson;
    return max === 0 ? 'Sem limite' : `${this.lead().trialsCount} de ${max} usada${max === 1 ? '' : 's'}`;
  });

  ngOnInit(): void {
    this.leads.watch();
    const l = this.lead();
    // Começa na modalidade e no período do interesse, se houver aula.
    if (l.interest.programId && this.store.programById(l.interest.programId)) this.programId.set(l.interest.programId);
    if (l.interest.period) this.period.set(l.interest.period);
  }

  protected waLink(s: TrialSlot): string | null {
    const center = this.ctx.center()?.name ?? 'o centro';
    const text = `Olá, ${firstName(this.lead().name)}! Sua aula experimental no ${center} ficou para ${dayShort(s.date)} às ${s.startTime} · ${s.className}${s.coachName ? ' com ' + s.coachName : ''}. Até lá!`;
    return whatsAppLink(this.lead().phone, text);
  }

  protected async schedule(): Promise<void> {
    const slot = this.slots().find((s) => s.sessionId === this.picked());
    if (!slot || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.leads.scheduleTrial(this.lead().id, slot.sessionId);
      this.done.set(slot);
    } catch (e) {
      this.error.set(trialErrorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
