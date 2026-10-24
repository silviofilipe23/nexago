import { ChangeDetectionStrategy, Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CenterContextService } from '../../core/center-context.service';
import { writeErrorMessage } from '../../data/actions/actor';
import { CenterStore } from '../../data/center-store.service';
import { formatDayKey, formatInstant, todayKey, wallClock } from '../../domain/dates';
import { freeSeats } from '../../domain/enrollment';
import { AuditTrailComponent, BannerComponent, ModalComponent, PageHeaderComponent, PersonComponent, type AuditRow } from '../../ui/kit';
import { NewEnrollmentComponent } from '../enrollments/new-enrollment.component';
import { trialErrorMessage } from '../trials/trial-view';
import { ConvertLeadComponent } from './convert-lead.component';
import {
  EXPERIENCE_LABEL,
  FUNNEL,
  LEVEL_LABEL,
  LOST_LABEL,
  PERIOD_LABEL,
  SOURCE_LABEL,
  STAGE_LABEL,
  dayShort,
  firstName,
  whatsAppLink,
  type Lead,
  type LostReason,
} from './lead-model';
import { LeadFormComponent } from './lead-form.component';
import { LeadsService } from './leads.service';
import { ScheduleTrialComponent } from './schedule-trial.component';

const LOST_REASONS = Object.entries(LOST_LABEL) as [LostReason, string][];

/** C3 — Interessado: contato, interesse, experimental com a avaliação do professor e histórico. */
@Component({
  selector: 'ct-lead-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    PageHeaderComponent,
    BannerComponent,
    PersonComponent,
    AuditTrailComponent,
    ModalComponent,
    LeadFormComponent,
    ScheduleTrialComponent,
    ConvertLeadComponent,
    NewEnrollmentComponent,
  ],
  template: `
    @if (lead(); as l) {
      <ct-page-header [title]="l.name" [subtitle]="subtitle()">
        <a class="ct-ghost-btn" [routerLink]="['/centro', ctx.activeCenterId(), 'captacao']">Voltar ao funil</a>
        @if (l.stage !== 'won' && l.stage !== 'lost') {
          <button type="button" class="ct-mini-btn" [disabled]="!ctx.canWrite()" (click)="showLost.set(true)">Marcar como perdido</button>
        }
        @if (l.stage === 'lost') {
          <button type="button" class="ct-mini-btn" [disabled]="!ctx.canWrite() || busy()" (click)="reopen(l)">Reabrir</button>
        }
        @if (l.stage !== 'won') {
          <button type="button" class="ct-mini-btn" [disabled]="!ctx.canWrite() || hasUpcomingTrial()" (click)="showSchedule.set(true)">
            {{ l.trial && l.trial.status !== 'canceled' && l.trial.status !== 'declined' ? 'Agendar outra experimental' : 'Agendar experimental' }}
          </button>
          <button type="button" class="ct-mini-btn ct-mini-btn-primary" [disabled]="!ctx.canWrite()" (click)="showConvert.set(true)">Matricular</button>
        } @else if (l.studentId) {
          <a class="ct-mini-btn ct-mini-btn-primary" [routerLink]="['/centro', ctx.activeCenterId(), 'alunos', l.studentId]">Ver aluno</a>
        }
      </ct-page-header>
      @if (err()) {
        <ct-banner tone="red" title="Algo deu errado">{{ err() }}</ct-banner>
      }
      <div class="page">
        @if (l.stage === 'lost') {
          <ct-banner tone="red" [inline]="true" title="Perdido">Motivo: {{ l.lostReason ? LOST_LABEL[l.lostReason] : 'não informado' }}. Reabra se a pessoa voltar a falar com o centro.</ct-banner>
        }
        <div class="stages" role="list" aria-label="Etapas">
          @for (s of FUNNEL; track s.stage; let i = $index) {
            <div role="listitem" class="stage" [class.done]="i <= stageIndex()" [class.cur]="i === stageIndex()">{{ s.label }}</div>
          }
        </div>

        <div class="grid">
          <div class="col">
            <section class="ct-card">
              <div class="ct-card-head">
                <div class="ct-grow">
                  <div class="ct-kick">{{ l.athleteId ? 'Tem conta NexaGO' : 'Ainda sem conta NexaGO' }}</div>
                  <div class="ct-card-title">Contato</div>
                </div>
                <button type="button" class="ct-ghost-btn" [disabled]="!ctx.canWrite()" (click)="showEdit.set(true)">Editar</button>
              </div>
              <div class="ct-kv mono"><span>WhatsApp</span><span>{{ l.phone || '—' }}</span></div>
              <div class="ct-kv"><span>E-mail</span><span>{{ l.email || '—' }}</span></div>
              <div class="ct-kv"><span>Idade</span><span>{{ l.age ? l.age + ' anos' : '—' }}</span></div>
              <div class="ct-kv"><span>Origem</span><span>{{ SOURCE_LABEL[l.source] }}{{ l.referredBy ? ' · ' + l.referredBy : '' }}</span></div>
              <div class="ct-kv"><span>Responsável</span><span>{{ l.ownerName || '—' }}</span></div>
              @if (wa(); as link) {
                <a class="ct-mini-btn wa" [href]="link" target="_blank" rel="noopener">Conversar no WhatsApp</a>
              }
            </section>
            <section class="ct-card">
              <div class="ct-card-head"><div class="ct-grow"><div class="ct-card-title">Interesse</div></div></div>
              <div class="ct-kv"><span>Modalidade</span><span>{{ l.interest.programName || 'A definir' }}</span></div>
              <div class="ct-kv"><span>Experiência</span><span>{{ l.interest.experience ? EXPERIENCE_LABEL[l.interest.experience] : '—' }}</span></div>
              <div class="ct-kv"><span>Horário</span><span>{{ l.interest.period ? PERIOD_LABEL[l.interest.period] : '—' }}</span></div>
              <div class="ct-kv"><span>Objetivo</span><span>{{ l.interest.goal || '—' }}</span></div>
            </section>
          </div>

          <section class="ct-card">
            <div class="ct-card-head">
              <div class="ct-grow">
                <div class="ct-kick">{{ trialKicker() }}</div>
                <div class="ct-card-title">Aula experimental</div>
              </div>
            </div>
            @if (l.trial; as t) {
              <div class="pills">
                <span [class]="'ct-pill ' + trialPill()[1]">{{ trialPill()[0] }}</span>
                <span class="ct-pill dim">{{ price() }}</span>
                <span class="ct-grow"></span>
                @if (canCancelTrial()) {
                  <button type="button" class="ct-ghost-btn" [disabled]="busy()" (click)="cancelTrial(t.bookingId)">Desmarcar</button>
                }
              </div>
              @if (l.coachFeedback; as f) {
                <div class="fb">
                  <ct-person [name]="'Avaliação de ' + (f.byName || 'professor')" [sub]="f.at ? 'Enviada pelo app do professor · ' + formatInstant(f.at) : 'Enviada pelo app do professor'" [colorKey]="f.byName" [size]="30" />
                  <div class="fb-grid">
                    <div><div class="ct-kick">Nível sugerido</div><div class="ct-disp v">{{ f.level ? LEVEL_LABEL[f.level] : '—' }}</div></div>
                    <div>
                      <div class="ct-kick">Turma sugerida</div>
                      <div class="ct-disp v">{{ f.className || '—' }}</div>
                      @if (suggestedSeats() != null) {
                        <div class="ct-mono seats" [class.full]="suggestedSeats() === 0">{{ suggestedSeats() === 0 ? 'LOTADA' : suggestedSeats() + (suggestedSeats() === 1 ? ' VAGA' : ' VAGAS') }}</div>
                      }
                    </div>
                  </div>
                  @if (f.note) {
                    <div class="note">“{{ f.note }}”</div>
                  }
                </div>
              } @else if (t.attendance === 'attended') {
                <div class="ct-dim pad">Compareceu. A avaliação do professor aparece aqui quando ele enviar pelo app.</div>
              } @else if (t.attendance === 'no_show') {
                <div class="ct-dim pad">Não veio. Combine outro horário e agende de novo — a falta não conta no limite por pessoa.</div>
              } @else if (t.status === 'confirmed' || t.status === 'pending') {
                <div class="ct-dim pad">{{ t.coachName ? t.coachName + ' vê' : 'O professor vê' }} nome, experiência e objetivo na chamada e avalia pelo app depois da aula.</div>
              }
              @if (l.stage === 'attended' || l.proposalUntil) {
                <div class="ct-kick prop">Proposta</div>
                <div class="ct-kv"><span>Turma</span><span>{{ l.coachFeedback?.className || t.className }}</span></div>
                <div class="ct-kv"><span>Válida até</span><span>{{ l.proposalUntil ? formatDayKey(l.proposalUntil) : 'sem prazo' }}</span></div>
              }
            } @else {
              <div class="ct-empty">
                Nenhuma experimental ainda.
                @if (l.stage !== 'won') {
                  <div><button type="button" class="ct-mini-btn ct-mini-btn-primary first" [disabled]="!ctx.canWrite()" (click)="showSchedule.set(true)">Agendar experimental</button></div>
                }
              </div>
            }
          </section>

          <section class="ct-card">
            <div class="ct-card-head">
              <div class="ct-grow">
                <div class="ct-kick">Contatos e mudanças de etapa</div>
                <div class="ct-card-title">Histórico</div>
              </div>
            </div>
            <ct-audit-trail [rows]="history()" />
            <div class="note-box">
              <input class="ct-input" placeholder="Registrar contato ou nota…" maxlength="300" [value]="noteText()" (input)="noteText.set(v($event))"
                [disabled]="!ctx.canWrite() || busy()" (keydown.enter)="addNote(l, 'contact')" />
              <div class="note-acts">
                <button type="button" class="ct-ghost-btn" [disabled]="!noteText().trim() || busy()" (click)="addNote(l, 'note')">Nota</button>
                <button type="button" class="ct-mini-btn" [disabled]="!noteText().trim() || busy()" (click)="addNote(l, 'contact')">Registrar contato</button>
              </div>
            </div>
          </section>
        </div>
      </div>

      @if (showEdit()) {
        <ct-lead-form [lead]="l" (closed)="showEdit.set(false)" (saved)="showEdit.set(false)" />
      }
      @if (showSchedule()) {
        <ct-schedule-trial [lead]="l" (closed)="showSchedule.set(false)" (finished)="showSchedule.set(false)" />
      }
      @if (showConvert()) {
        <ct-convert-lead [lead]="l" (closed)="showConvert.set(false)" (ready)="onReady($event)" />
      }
      @if (enroll(); as e) {
        <ct-new-enrollment [initialStudentId]="e.studentId" [initialClassId]="e.classId" (closed)="enroll.set(null)" (created)="onEnrolled(l, $event)"
          (sendContract)="onSendContract(l, $event)" />
      }
      @if (showLost()) {
        <ct-modal title="Marcar como perdido" [kicker]="l.name" [width]="440" (closed)="showLost.set(false)">
          <div class="reasons">
            @for (r of LOST_REASONS; track r[0]) {
              <button type="button" class="ct-chip" [class.active]="lostReason() === r[0]" (click)="lostReason.set(r[0])">{{ r[1] }}</button>
            }
          </div>
          <ng-container footer>
            <button type="button" class="ct-ghost-btn" (click)="showLost.set(false)">Cancelar</button>
            <button type="button" class="ct-mini-btn ct-mini-btn-primary" [disabled]="busy()" (click)="markLost(l)">Marcar como perdido</button>
          </ng-container>
        </ct-modal>
      }
    } @else if (leads.loaded()) {
      <ct-page-header title="Interessado" />
      <div class="page"><div class="ct-empty">Interessado não encontrado. <a [routerLink]="['/centro', ctx.activeCenterId(), 'captacao']">Voltar ao funil</a></div></div>
    } @else {
      <div class="page"><div class="ct-empty">Carregando…</div></div>
    }
  `,
  styles: `
    .page { padding: 20px var(--ct-gutter) 26px; display: flex; flex-direction: column; gap: 16px; }
    .stages { display: flex; gap: 6px; overflow-x: auto; }
    .stage { flex: 1; min-width: 120px; height: 34px; border-radius: var(--nx-r-2); display: flex; align-items: center; justify-content: center; border: 1px solid var(--nx-line);
      font-family: var(--nx-font-display); font-weight: 600; font-size: 12px; color: var(--nx-text-dim); white-space: nowrap; padding: 0 8px; }
    .stage.done { background: var(--nx-surface-1); color: var(--nx-text); }
    .stage.cur { background: rgba(255,106,26,0.12); border-color: rgba(255,106,26,0.5); color: var(--nx-orange-400); }
    .grid { display: grid; grid-template-columns: 320px minmax(0, 1fr) 360px; gap: 16px; align-items: start; }
    .col { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
    .wa { margin-top: 12px; text-decoration: none; justify-content: center; }
    .pills { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
    .ct-pill.dim { color: var(--nx-text-mute); background: var(--nx-surface-1); border-color: var(--nx-line); }
    .fb { margin-top: 16px; padding: 16px; border-radius: var(--nx-r-3); background: var(--nx-surface-1); border: 1px solid var(--nx-line); }
    .fb-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 14px; }
    .v { margin-top: 4px; font-size: 15px; font-weight: 700; }
    .seats { margin-top: 2px; font-size: 10px; color: var(--nx-win); } .seats.full { color: var(--nx-pending); }
    .note { margin-top: 14px; font-size: 12.5px; line-height: 1.5; color: var(--nx-text-mute); font-style: italic; }
    .pad { margin-top: 14px; font-size: 12.5px; line-height: 1.5; }
    .prop { margin-top: 18px; margin-bottom: 4px; }
    .first { margin-top: 12px; }
    .note-box { margin-top: 14px; display: flex; flex-direction: column; gap: 8px; }
    .note-acts { display: flex; gap: 8px; justify-content: flex-end; }
    .reasons { display: flex; gap: 8px; flex-wrap: wrap; }
    @media (max-width: 1280px) { .grid { grid-template-columns: 300px minmax(0, 1fr); } .grid > :last-child { grid-column: 1 / -1; } }
    @media (max-width: 820px) { .grid { grid-template-columns: 1fr; } }
  `,
})
export class LeadDetailComponent implements OnInit {
  readonly leadId = input.required<string>();
  /** `?agendar=1` abre o agendamento (vindo do "Salvar e agendar"). */
  readonly agendar = input<string>();

  protected readonly ctx = inject(CenterContextService);
  protected readonly store = inject(CenterStore);
  protected readonly leads = inject(LeadsService);
  private readonly router = inject(Router);

  protected readonly FUNNEL = FUNNEL;
  protected readonly SOURCE_LABEL = SOURCE_LABEL;
  protected readonly EXPERIENCE_LABEL = EXPERIENCE_LABEL;
  protected readonly PERIOD_LABEL = PERIOD_LABEL;
  protected readonly LEVEL_LABEL = LEVEL_LABEL;
  protected readonly LOST_LABEL = LOST_LABEL;
  protected readonly LOST_REASONS = LOST_REASONS;
  protected readonly formatDayKey = formatDayKey;

  protected readonly showEdit = signal(false);
  protected readonly showSchedule = signal(false);
  protected readonly showConvert = signal(false);
  protected readonly showLost = signal(false);
  protected readonly lostReason = signal<LostReason>('no_response');
  protected readonly enroll = signal<{ studentId: string; classId: string | null } | null>(null);
  protected readonly noteText = signal('');
  protected readonly busy = signal(false);
  protected readonly err = signal('');

  protected readonly lead = computed(() => this.leads.byId(this.leadId()) ?? null);
  private readonly tz = computed(() => this.ctx.center()?.timezone);
  private readonly today = computed(() => todayKey(this.tz()));

  protected readonly stageIndex = computed(() => {
    const s = this.lead()?.stage;
    return s === 'lost' ? -1 : FUNNEL.findIndex((f) => f.stage === s);
  });

  protected readonly subtitle = computed(() => {
    const l = this.lead();
    if (!l) return '';
    const since = l.createdAt ? `Interessado desde ${formatDayKey(wallClock(l.createdAt, this.tz()).dayKey)}` : 'Interessado';
    return [since, SOURCE_LABEL[l.source], l.ownerName ? `responsável ${l.ownerName}` : '', STAGE_LABEL[l.stage]].filter(Boolean).join(' · ');
  });

  protected readonly hasUpcomingTrial = computed(() => {
    const t = this.lead()?.trial;
    return !!t && (t.status === 'confirmed' || t.status === 'pending') && !t.attendance && t.date >= this.today();
  });

  protected readonly canCancelTrial = computed(() => {
    const t = this.lead()?.trial;
    if (!t || !this.hasUpcomingTrial() || !this.ctx.canWrite()) return false;
    return t.date > this.today() || t.startTime > wallClock(new Date(), this.tz()).time;
  });

  protected readonly trialKicker = computed(() => {
    const t = this.lead()?.trial;
    if (!t) return 'Ainda não agendada';
    return [`${dayShort(t.date)} · ${t.className} · ${t.startTime}`, t.locationName].filter(Boolean).join(' · ');
  });

  protected readonly trialPill = computed<[string, string]>(() => {
    const t = this.lead()?.trial;
    if (!t) return ['—', 'dim'];
    if (t.attendance === 'attended') return ['Compareceu', 'green'];
    if (t.attendance === 'no_show') return ['Não veio', 'red'];
    if (t.status === 'canceled') return ['Desmarcada', 'dim'];
    if (t.status === 'declined') return ['Recusada', 'red'];
    if (t.status === 'pending') return ['Aguardando confirmação', 'yellow'];
    return ['Agendada', 'yellow'];
  });

  protected readonly price = computed(() => {
    const p = this.ctx.center()?.showcase.trial.priceReais ?? 0;
    return p > 0 ? `R$ ${p.toFixed(2).replace('.', ',')}` : 'Gratuita';
  });

  protected readonly suggestedSeats = computed(() => {
    const id = this.lead()?.coachFeedback?.classId;
    const c = id ? this.store.classById(id) : undefined;
    return c ? freeSeats(c) : null;
  });

  protected readonly history = computed<AuditRow[]>(() => {
    const l = this.lead();
    if (!l) return [];
    return [...l.history].reverse().map((h) => ({ when: h.at ? formatInstant(h.at, this.tz()) : '', who: h.byName, what: h.text }));
  });

  protected readonly wa = computed(() => {
    const l = this.lead();
    if (!l) return null;
    const center = this.ctx.center()?.name ?? 'o centro';
    return whatsAppLink(l.phone, `Olá, ${firstName(l.name)}! Aqui é ${center}.`);
  });

  ngOnInit(): void {
    this.leads.watch();
    if (this.agendar()) this.showSchedule.set(true);
  }

  protected formatInstant(at: Date): string {
    return formatInstant(at, this.tz());
  }

  protected v(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  private async run(fn: () => Promise<unknown>, onError: (e: unknown) => string = writeErrorMessage): Promise<boolean> {
    if (this.busy()) return false;
    this.busy.set(true);
    this.err.set('');
    try {
      await fn();
      return true;
    } catch (e) {
      this.err.set(onError(e));
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  protected async addNote(l: Lead, kind: 'contact' | 'note'): Promise<void> {
    const text = this.noteText().trim();
    if (!text) return;
    if (await this.run(() => this.leads.addNote(l, kind === 'contact' ? `Contato · ${text}` : text, kind))) this.noteText.set('');
  }

  protected async markLost(l: Lead): Promise<void> {
    if (await this.run(() => this.leads.moveTo(l, 'lost', this.lostReason()))) this.showLost.set(false);
  }

  protected reopen(l: Lead): void {
    void this.run(() => this.leads.moveTo(l, 'contacted'));
  }

  protected cancelTrial(bookingId: string): void {
    void this.run(() => this.leads.cancelTrial(bookingId), trialErrorMessage);
  }

  protected onReady(e: { studentId: string; classId: string | null }): void {
    this.showConvert.set(false);
    this.enroll.set(e);
  }

  protected async onEnrolled(l: Lead, enrollmentId: string): Promise<void> {
    // A matrícula recém-criada pode ainda não ter chegado pelo listener: usa a turma aberta no passo.
    const classId = this.store.enrollments().find((x) => x.id === enrollmentId)?.classId ?? this.enroll()?.classId ?? '';
    this.enroll.set(null);
    await this.run(() => this.leads.markWon(l, enrollmentId, this.store.classById(classId)?.name ?? ''));
  }

  /** "Enviar contrato" depois de matricular: marca o ganho e segue para Contratos com o aluno. */
  protected async onSendContract(l: Lead, e: { studentId: string; enrollmentId: string }): Promise<void> {
    await this.onEnrolled(l, e.enrollmentId);
    void this.router.navigate(['/centro', this.ctx.activeCenterId(), 'contratos'], { queryParams: { aluno: e.studentId, matricula: e.enrollmentId } });
  }
}
