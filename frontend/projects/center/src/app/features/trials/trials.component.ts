import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { CenterContextService } from '../../core/center-context.service';
import { TrialsActions } from '../../data/actions/trials.actions';
import { BannerComponent, PageHeaderComponent, PersonComponent, StatComponent } from '../../ui/kit';
import {
  TRIAL_NOTE_MAX,
  TRIAL_STATUS,
  applyDecision,
  countPending,
  filterTrials,
  todayKeyBr,
  trialErrorMessage,
  trialWhen,
  whatsAppLink,
  type CenterTrialBooking,
  type TrialFilter,
} from './trial-view';

const FILTERS: { value: TrialFilter; label: string }[] = [
  { value: 'pending', label: 'Aguardando' },
  { value: 'upcoming', label: 'Próximas' },
  { value: 'all', label: 'Todas' },
];

/** Experimentais pedidas pelo app: a equipe confirma ou recusa, e o atleta recebe o aviso. */
@Component({
  selector: 'ct-trials',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeaderComponent, StatComponent, BannerComponent, PersonComponent],
  template: `
    <ct-page-header title="Experimentais" [subtitle]="subtitle()" />
    @if (err()) {
      <ct-banner tone="red" title="Algo deu errado">{{ err() }}</ct-banner>
    }
    <div class="page">
      @if (list(); as l) {
        <div class="ct-stats">
          <ct-stat label="Aguardando confirmação" [value]="'' + pending()" [tone]="pending() ? 'red' : ''" sub="o atleta já reservou a vaga" />
          <ct-stat label="Confirmadas a seguir" [value]="'' + upcomingConfirmed()" sub="a partir de hoje" />
        </div>

        <div class="ct-filter-bar">
          @for (f of FILTERS; track f.value) {
            <button type="button" class="ct-chip" [class.active]="filter() === f.value" (click)="filter.set(f.value)">
              {{ f.label }}{{ f.value === 'pending' ? ' · ' + pending() : '' }}
            </button>
          }
        </div>

        <section class="ct-card flush list">
          @for (b of visible(); track b.id) {
            <article class="item" [class.open]="b.status === 'pending'">
              <header class="top">
                <ct-person class="ct-grow" [name]="b.name" [sub]="b.phone" [colorKey]="b.athleteId" [photoUrl]="b.photoUrl" [zoomable]="true" [size]="44" />
                <span [class]="'ct-pill ' + STATUS[b.status][1]">{{ STATUS[b.status][0] }}</span>
              </header>
              <div class="when">
                <div class="ct-disp">{{ b.className }}</div>
                <div class="ct-mono">{{ trialWhen(b) }}{{ b.coachName ? ' · ' + b.coachName : '' }}{{ b.locationName ? ' · ' + b.locationName : '' }}</div>
              </div>
              @if (b.status !== 'pending' && (b.decidedByName || b.note)) {
                <div class="ct-dim small">
                  {{ b.decidedByName ? STATUS[b.status][0] + ' por ' + b.decidedByName : '' }}{{ b.note ? ' · “' + b.note + '”' : '' }}
                </div>
              }
              @if (b.status === 'pending') {
                <div class="answer">
                  <input class="ct-input" type="text" [attr.maxlength]="NOTE_MAX" [attr.aria-label]="'Recado para ' + b.name"
                    placeholder="Recado ao atleta (opcional, vai no aviso)" [value]="draft(b.id)" [disabled]="busyId() === b.id"
                    (input)="setDraft(b.id, value($event))" />
                  <div class="answer-foot">
                    @if (whatsApp(b); as link) {
                      <a class="ct-ghost-btn" [href]="link" target="_blank" rel="noopener">WhatsApp</a>
                    }
                    <span class="ct-grow"></span>
                    <button type="button" class="ct-ghost-btn" [disabled]="busyId() != null" (click)="decide(b, 'decline')">Recusar</button>
                    <button type="button" class="ct-mini-btn ct-mini-btn-primary" [disabled]="busyId() != null" (click)="decide(b, 'confirm')">
                      {{ busyId() === b.id ? 'Salvando…' : 'Confirmar' }}
                    </button>
                  </div>
                </div>
              }
            </article>
          } @empty {
            <div class="ct-empty">
              {{ l.length ? 'Nenhuma experimental neste filtro.' : 'Nenhum pedido ainda. Com a aula experimental ligada em Configurações › Vitrine no app, o atleta escolhe a aula pelo app e o pedido aparece aqui.' }}
            </div>
          }
        </section>
      } @else if (loading()) {
        <div class="ct-empty">Carregando…</div>
      }
    </div>
  `,
  styles: `
    .page { padding: 20px var(--ct-gutter) 26px; display: flex; flex-direction: column; gap: 16px; }
    .list { padding: 0; }
    .item { padding: 16px 18px; border-top: 1px solid var(--nx-line); display: flex; flex-direction: column; gap: 10px; }
    .item:first-child { border-top: 0; }
    .item.open { box-shadow: inset 3px 0 0 var(--nx-pending); }
    .top { display: flex; align-items: center; gap: 12px; }
    .small { font-size: 12px; }
    .answer { display: flex; flex-direction: column; gap: 8px; }
    .answer-foot { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    a.ct-ghost-btn { text-decoration: none; }
  `,
})
export class TrialsComponent {
  protected readonly ctx = inject(CenterContextService);
  private readonly actions = inject(TrialsActions);

  protected readonly FILTERS = FILTERS;
  protected readonly STATUS = TRIAL_STATUS;
  protected readonly NOTE_MAX = TRIAL_NOTE_MAX;
  protected readonly trialWhen = trialWhen;

  protected readonly list = signal<CenterTrialBooking[] | null>(null);
  protected readonly loading = signal(false);
  protected readonly err = signal('');
  protected readonly filter = signal<TrialFilter>('pending');
  protected readonly drafts = signal<Record<string, string>>({});
  protected readonly busyId = signal<string | null>(null);

  private readonly today = todayKeyBr();
  protected readonly pending = computed(() => countPending(this.list() ?? []));
  protected readonly upcomingConfirmed = computed(
    () => (this.list() ?? []).filter((b) => b.status === 'confirmed' && b.date >= this.today).length,
  );
  protected readonly visible = computed(() => filterTrials(this.list() ?? [], this.filter(), this.today));
  protected readonly subtitle = computed(() => this.ctx.center()?.name ?? '');

  /** Requisição em voo — uma resposta de outro centro (troca rápida) é descartada. */
  private seq = 0;

  constructor() {
    effect(() => {
      const centerId = this.ctx.activeCenterId();
      if (!centerId) return;
      untracked(() => this.reload());
    });
  }

  protected value(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  protected draft(id: string): string {
    return this.drafts()[id] ?? '';
  }

  protected setDraft(id: string, text: string): void {
    this.drafts.update((d) => ({ ...d, [id]: text.slice(0, TRIAL_NOTE_MAX) }));
  }

  protected whatsApp(b: CenterTrialBooking): string | null {
    const center = this.ctx.center()?.name ?? 'o centro';
    return whatsAppLink(b.phone, `Olá, ${b.name.split(' ')[0]}! Aqui é ${center}, sobre sua aula experimental de ${trialWhen(b)}.`);
  }

  private async reload(): Promise<void> {
    const seq = ++this.seq;
    this.list.set(null);
    this.drafts.set({});
    this.loading.set(true);
    this.err.set('');
    try {
      const l = await this.actions.load();
      if (seq === this.seq) this.list.set(l);
    } catch (e) {
      if (seq === this.seq) this.err.set(trialErrorMessage(e));
    } finally {
      if (seq === this.seq) this.loading.set(false);
    }
  }

  protected async decide(b: CenterTrialBooking, decision: 'confirm' | 'decline'): Promise<void> {
    if (this.busyId()) return;
    const note = this.draft(b.id).trim();
    this.busyId.set(b.id);
    this.err.set('');
    try {
      const r = await this.actions.decide(b.id, decision, note);
      const by = this.ctx.me()?.displayName ?? '';
      this.list.update((l) => (l ? applyDecision(l, b.id, r.status, by, note || null) : l));
    } catch (e) {
      this.err.set(trialErrorMessage(e));
    } finally {
      this.busyId.set(null);
    }
  }
}
