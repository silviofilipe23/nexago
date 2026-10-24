import { ChangeDetectionStrategy, Component, computed, effect, input, signal, untracked } from '@angular/core';
import { callCenterFunction } from '../../data/actions/invoices.actions';
import { WEEKDAY_SHORT, weekdayOf } from '../../domain/dates';
import { IconComponent } from '../../ui/icon.component';
import { trialErrorMessage } from '../trials/trial-view';
import { isValidPhone } from '../leads/lead-model';

interface Slot {
  sessionId: string;
  className: string;
  programId: string;
  programName: string;
  level: string;
  teacherName: string;
  place: string;
  address: string;
  date: string;
  startTime: string;
  endTime: string;
  spotsLeft: number;
}

interface PageData {
  center: { id: string; name: string; city: string; state: string; address: string; coverUrl: string | null; description: string };
  trial: { priceReais: number; note: string };
  programs: { id: string; name: string }[];
  slots: Slot[];
}

interface Booked {
  bookingId: string;
  token: string;
  className: string;
  teacherName: string;
  place: string;
  address: string;
  date: string;
  startTime: string;
  endTime: string;
}

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function dayLabel(d: string): string {
  return `${WEEKDAY_SHORT[weekdayOf(d)]} ${d.slice(8, 10)}`;
}

/** Guardado no aparelho para o "Não vou conseguir ir" sobreviver a um recarregar. */
function storageKey(centerId: string): string {
  return `nexago-ct-trial:${centerId}`;
}

/**
 * C9/C10 — Página pública do CT: a pessoa escolhe a modalidade e um horário com vaga e agenda a
 * aula experimental SEM conta (callables públicas de `training-center-leads.ts`). O desmarque usa
 * o token devolvido no agendamento.
 */
@Component({
  selector: 'ct-public-trial',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <main class="wrap">
      @if (booked(); as b) {
        <div class="ok-ic"><ct-icon name="check" [size]="30" /></div>
        <h1 class="big">{{ canceled() ? 'Aula desmarcada' : 'Aula agendada' }}</h1>
        <p class="lead">
          @if (canceled()) {
            Tudo certo, avisamos o centro. Quando quiser, é só escolher outro horário.
          } @else {
            Te esperamos {{ weekdayLong(b.date) }}. O centro vai falar com você pelo WhatsApp.
          }
        </p>
        <section class="card rows">
          <div class="row"><span>Quando</span><span class="mono">{{ longDate(b.date) }} · {{ b.startTime }}</span></div>
          <div class="row"><span>Turma</span><span class="mono">{{ b.className }}</span></div>
          @if (b.teacherName) {
            <div class="row"><span>Professor</span><span class="mono">{{ b.teacherName }}</span></div>
          }
          <div class="row"><span>Onde</span><span class="mono">{{ where(b) }}</span></div>
        </section>
        @if (data()?.trial?.note) {
          <section class="card">
            <div class="kick">Bom saber</div>
            <p class="small">{{ data()!.trial.note }}</p>
          </section>
        }
        <section class="card">
          <div class="kick">O que levar</div>
          <p class="small">Roupa leve, protetor solar e água.</p>
        </section>
        @if (error()) {
          <p class="err" role="alert">{{ error() }}</p>
        }
        <footer class="foot">
          @if (!canceled()) {
            <a class="btn ghost" [href]="calendarUrl(b)" target="_blank" rel="noopener">Adicionar à agenda</a>
            <button type="button" class="btn link" [disabled]="busy()" (click)="cancel(b)">{{ busy() ? 'Desmarcando…' : 'Não vou conseguir ir' }}</button>
          } @else {
            <button type="button" class="btn" (click)="restart()">Escolher outro horário</button>
          }
        </footer>
      } @else if (data(); as d) {
        <header class="head">
          <div>
            <h1>{{ d.center.name }}</h1>
            <div class="sub">{{ d.trial.priceReais > 0 ? 'AULA EXPERIMENTAL · ' + priceLabel(d.trial.priceReais) : 'AULA EXPERIMENTAL GRÁTIS' }}</div>
          </div>
          <span class="mark">{{ initials(d.center.name) }}</span>
        </header>
        @if (d.center.coverUrl) {
          <img class="cover" [src]="d.center.coverUrl" alt="" />
        }
        @if (d.center.description) {
          <p class="small">{{ d.center.description }}</p>
        }
        @if (d.programs.length > 1) {
          <div class="grp">
            <span class="kick">Modalidade</span>
            <div class="chips">
              @for (p of d.programs; track p.id) {
                <button type="button" class="chip" [class.on]="programId() === p.id" (click)="pickProgram(p.id)">{{ p.name }}</button>
              }
            </div>
          </div>
        }
        <div class="grp">
          <span class="kick">Você já joga?</span>
          <div class="chips">
            <button type="button" class="chip" [class.on]="experience() === 'never'" (click)="experience.set('never')">Nunca joguei</button>
            <button type="button" class="chip" [class.on]="experience() === 'plays'" (click)="experience.set('plays')">Já jogo</button>
          </div>
        </div>
        <div class="grp">
          <span class="kick">Horários com vaga</span>
          @for (s of visible(); track s.sessionId) {
            <button type="button" class="slot" [class.on]="sessionId() === s.sessionId" (click)="sessionId.set(s.sessionId)">
              <span class="when"><span class="d">{{ dayLabel(s.date) }}</span><span class="t mono">{{ s.startTime }}</span></span>
              <span class="cl"><span class="n">{{ s.className }}</span><span class="s">{{ duration(s) }}{{ s.place ? ' · ' + s.place : '' }}</span></span>
              @if (sessionId() === s.sessionId) {
                <ct-icon name="check" [size]="18" class="ck" />
              }
            </button>
          } @empty {
            <div class="empty">Nenhum horário com vaga nas próximas 2 semanas. Fale com o centro pelo WhatsApp.</div>
          }
        </div>
        <label class="field"><span class="kick">Seu nome</span><input class="in" autocomplete="name" maxlength="80" [value]="name()" (input)="name.set(v($event))" /></label>
        <label class="field"><span class="kick">WhatsApp</span><input class="in mono" type="tel" inputmode="tel" autocomplete="tel" placeholder="(21) 9 0000-0000" maxlength="30" [value]="phone()" (input)="phone.set(v($event))" /></label>
        <p class="fine">Usamos seu WhatsApp só para falar sobre esta aula. Sem cadastro.</p>
        @if (error()) {
          <p class="err" role="alert">{{ error() }}</p>
        }
        <footer class="foot">
          <button type="button" class="btn" [disabled]="busy() || !sessionId()" (click)="book(d)">
            {{ busy() ? 'Agendando…' : d.trial.priceReais > 0 ? 'Agendar aula experimental' : 'Agendar aula grátis' }}
          </button>
        </footer>
      } @else if (error()) {
        <div class="empty center">{{ error() }}</div>
      } @else {
        <div class="empty center">Carregando…</div>
      }
    </main>
  `,
  styles: `
    :host { display: block; min-height: 100vh; background: var(--nx-bg, #0a0a0b); color: var(--nx-text); }
    .wrap { max-width: 460px; margin: 0 auto; padding: 28px 18px 32px; display: flex; flex-direction: column; gap: 14px; }
    .head { display: flex; align-items: center; gap: 12px; }
    .head > div { flex: 1; min-width: 0; }
    h1 { margin: 0; font-family: var(--nx-font-display); font-weight: 800; font-size: 24px; letter-spacing: -0.02em; }
    .big { font-size: 28px; letter-spacing: -0.03em; }
    .sub { margin-top: 4px; font-family: var(--nx-font-mono); font-size: 10.5px; font-weight: 700; letter-spacing: 0.1em; color: var(--nx-orange-400); }
    .mark { width: 42px; height: 42px; border-radius: 13px; display: grid; place-items: center; background: linear-gradient(135deg, #ff6a1a, #ff8a4a); color: #fff; font-family: var(--nx-font-display); font-weight: 800; font-size: 13px; flex: none; }
    .cover { width: 100%; height: 150px; object-fit: cover; border-radius: 18px; border: 1px solid var(--nx-line); }
    .grp { display: flex; flex-direction: column; gap: 8px; }
    .kick { font-family: var(--nx-font-mono); font-size: 10px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--nx-text-dim); }
    .chips { display: flex; gap: 8px; flex-wrap: wrap; }
    .chip { height: 38px; padding: 0 16px; border-radius: 999px; border: 1px solid var(--nx-line-strong); background: var(--nx-surface-1); color: var(--nx-text-mute); font: 600 13px var(--nx-font-display); cursor: pointer; }
    .chip.on { background: var(--nx-orange-500); border-color: var(--nx-orange-500); color: #0a0a0a; }
    .slot { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 16px; background: var(--nx-surface-1); border: 1px solid var(--nx-line); text-align: left; color: inherit; font: inherit; cursor: pointer; }
    .slot.on { background: rgba(255,106,26,0.08); border-color: var(--nx-orange-500); }
    .when { width: 56px; display: flex; flex-direction: column; }
    .d { font-family: var(--nx-font-display); font-weight: 700; font-size: 13px; }
    .t { font-size: 11px; font-weight: 700; color: var(--nx-text-dim); } .slot.on .t { color: var(--nx-orange-400); }
    .cl { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .n { font-family: var(--nx-font-display); font-weight: 600; font-size: 13.5px; }
    .s { margin-top: 2px; font-size: 11px; color: var(--nx-text-dim); }
    .ck { color: var(--nx-orange-400); }
    .field { display: flex; flex-direction: column; gap: 6px; }
    .in { height: 48px; padding: 0 14px; border-radius: 14px; background: var(--nx-surface-1); border: 1px solid var(--nx-line); color: var(--nx-text); font: 600 14px var(--nx-font-display); }
    .in:focus { outline: none; border-color: var(--nx-orange-500); }
    .mono { font-family: var(--nx-font-mono); }
    .fine { margin: 0; font-size: 11.5px; color: var(--nx-text-dim); }
    .small { margin: 0; font-size: 12.5px; line-height: 1.55; color: var(--nx-text-mute); }
    .lead { margin: 0; font-size: 13px; line-height: 1.5; color: var(--nx-text-mute); }
    .err { margin: 0; font-size: 12.5px; color: var(--nx-live); }
    .foot { display: flex; flex-direction: column; gap: 8px; margin-top: 6px; }
    .btn { height: 52px; border-radius: 16px; border: none; background: var(--nx-orange-500); color: #0a0a0a; font: 800 15px var(--nx-font-display); cursor: pointer; display: grid; place-items: center; text-decoration: none; }
    .btn:disabled { opacity: 0.5; cursor: default; }
    .btn.ghost { background: transparent; border: 1px solid var(--nx-line-strong); color: var(--nx-text); }
    .btn.link { height: 44px; background: transparent; color: var(--nx-text-dim); font-size: 13px; font-weight: 600; }
    .ok-ic { width: 64px; height: 64px; border-radius: 20px; background: rgba(43,209,126,0.14); border: 1px solid rgba(43,209,126,0.35); display: grid; place-items: center; color: var(--nx-win); margin-top: 24px; }
    .card { padding: 14px; border-radius: 18px; background: var(--nx-surface-1); border: 1px solid var(--nx-line); }
    .card .small { margin-top: 8px; }
    .rows { padding: 0 14px; }
    .row { display: flex; justify-content: space-between; gap: 12px; padding: 13px 0; border-top: 1px solid var(--nx-line); font-size: 13px; }
    .row:first-child { border-top: 0; }
    .row > span:last-child { font-size: 11.5px; font-weight: 600; text-align: right; }
    .empty { padding: 16px; font-size: 13px; color: var(--nx-text-dim); text-align: center; border: 1px dashed var(--nx-line); border-radius: 16px; }
    .empty.center { margin-top: 30vh; border: 0; }
  `,
})
export class PublicTrialComponent {
  readonly centerId = input.required<string>();

  protected readonly dayLabel = dayLabel;

  protected readonly data = signal<PageData | null>(null);
  protected readonly programId = signal('');
  protected readonly experience = signal<'never' | 'plays' | ''>('');
  protected readonly sessionId = signal<string | null>(null);
  protected readonly name = signal('');
  protected readonly phone = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly booked = signal<Booked | null>(null);
  protected readonly canceled = signal(false);

  protected readonly visible = computed(() => {
    const d = this.data();
    if (!d) return [];
    return d.slots.filter((s) => !this.programId() || s.programId === this.programId());
  });

  constructor() {
    effect(() => {
      const id = this.centerId();
      untracked(() => void this.load(id));
    });
  }

  private async load(centerId: string): Promise<void> {
    this.error.set('');
    try {
      const saved = localStorage.getItem(storageKey(centerId));
      const b = saved ? (JSON.parse(saved) as Booked) : null;
      // Agendamento ainda por acontecer neste aparelho: mostra a confirmação (C10).
      if (b && b.date >= new Date().toISOString().slice(0, 10)) this.booked.set(b);
    } catch {
      /* sem armazenamento local: segue sem lembrar */
    }
    try {
      const d = await callCenterFunction<PageData>('getTrainingCenterTrialPage', { centerId });
      this.data.set(d);
      if (d.programs.length) this.programId.set(d.programs[0]!.id);
    } catch (e) {
      this.error.set(trialErrorMessage(e));
    }
  }

  protected v(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  protected pickProgram(id: string): void {
    this.programId.set(id);
    if (!this.visible().some((s) => s.sessionId === this.sessionId())) this.sessionId.set(null);
  }

  protected initials(name: string): string {
    return name
      .split(/\s+/)
      .filter((w) => w.length > 2 || /^[A-Z]/.test(w))
      .slice(-2)
      .map((w) => w[0]!.toUpperCase())
      .join('') || 'CT';
  }

  protected where(b: Booked): string {
    return [b.place, b.address].filter(Boolean).join(' · ') || '—';
  }

  protected priceLabel(p: number): string {
    return `R$ ${p.toFixed(2).replace('.', ',')}`;
  }

  protected duration(s: Slot): string {
    const [h1, m1] = s.startTime.split(':').map(Number);
    const [h2, m2] = s.endTime.split(':').map(Number);
    const min = (h2! * 60 + m2!) - (h1! * 60 + m1!);
    return min > 0 ? `${min} min` : s.startTime;
  }

  protected weekdayLong(d: string): string {
    const names = ['no domingo', 'na segunda', 'na terça', 'na quarta', 'na quinta', 'na sexta', 'no sábado'];
    return names[weekdayOf(d)]!;
  }

  protected longDate(d: string): string {
    return `${dayLabel(d)} ${MONTHS[Number(d.slice(5, 7)) - 1]}`;
  }

  /** Google Agenda (abre no navegador; no celular oferece o app). Horário de Brasília. */
  protected calendarUrl(b: Booked): string {
    const stamp = (t: string) => `${b.date.replace(/-/g, '')}T${t.replace(':', '')}00`;
    const p = new URLSearchParams({
      action: 'TEMPLATE',
      text: `Aula experimental · ${b.className}`,
      dates: `${stamp(b.startTime)}/${stamp(b.endTime || b.startTime)}`,
      ctz: 'America/Sao_Paulo',
      location: [b.place, b.address].filter(Boolean).join(' · '),
      details: this.data()?.center.name ?? '',
    });
    return `https://calendar.google.com/calendar/render?${p.toString()}`;
  }

  protected async book(d: PageData): Promise<void> {
    if (this.busy() || !this.sessionId()) return;
    if (this.name().trim().length < 2) return this.error.set('Informe seu nome.');
    if (!isValidPhone(this.phone())) return this.error.set('Informe seu WhatsApp com DDD.');
    this.busy.set(true);
    this.error.set('');
    try {
      const b = await callCenterFunction<Booked>('bookTrainingCenterTrialPublic', {
        centerId: d.center.id,
        sessionId: this.sessionId(),
        name: this.name().trim(),
        phone: this.phone().trim(),
        experience: this.experience(),
        programId: this.programId(),
      });
      this.booked.set(b);
      this.canceled.set(false);
      try {
        localStorage.setItem(storageKey(d.center.id), JSON.stringify(b));
      } catch {
        /* ignore */
      }
    } catch (e) {
      this.error.set(trialErrorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  protected async cancel(b: Booked): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await callCenterFunction('cancelTrainingCenterTrialPublic', { centerId: this.centerId(), bookingId: b.bookingId, token: b.token });
      this.canceled.set(true);
      try {
        localStorage.removeItem(storageKey(this.centerId()));
      } catch {
        /* ignore */
      }
    } catch (e) {
      this.error.set(trialErrorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  protected restart(): void {
    this.booked.set(null);
    this.canceled.set(false);
    this.sessionId.set(null);
    if (this.data()) void this.load(this.centerId());
  }
}
