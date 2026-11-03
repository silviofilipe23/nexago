import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { shortDate, todayKeyLocal } from '../aulas/class.model';
import { ArenaAccessService } from '../data/arena-access.service';
import { ArenaContextService } from '../data/arena-context.service';
import { arenaFunctions } from '../data/functions';
import { AvatarComponent } from '../ui/avatar.component';
import { ModalComponent } from '../ui/modal.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PillComponent } from '../ui/pill.component';
import { ToggleComponent } from '../ui/toggle.component';
import { brl, dateTimeShort, dayMonth } from './ph-format';
import { PhLineComponent, PhPageComponent } from './planos-horario-ui';
import { groupWaitlist, isInPrime, leavingSubsFor, waitlistGroupLabel, type WaitlistGroup } from './schedule-plan.logic';
import type { ScheduleWaitlistEntry } from './schedule-plan.model';
import { offerScheduleWaitlist, removeScheduleWaitlist, saveScheduleRules } from './schedule-plan-repository';
import { SchedulePlansStore } from './schedule-plans.store';

const PREVIEW = 4;

/** 05 · Lista de espera — fila por dia/horário com posição, "Oferecer ao 1º", ofertas em curso e
 *  as regras da oferta automática (`saveArenaScheduleRules`). */
@Component({
  selector: 'ar-panel-ph-waitlist',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PhPageComponent, PhLineComponent, PanelCardComponent, PillComponent, AvatarComponent, ToggleComponent, ModalComponent],
  styleUrl: './planos-horario.scss',
  template: `
    <ar-ph-page [subtitle]="subtitle()" tab="espera" [empty]="!store.loading() && groups().length === 0">
      @if (store.loading()) {
        <p class="state-text">Carregando lista de espera…</p>
      } @else if (store.loadError(); as err) {
        <p class="state-text">{{ err }}</p>
      } @else {
        @if (message(); as m) {
          <div class="notice" [class.bad]="m.bad">{{ m.text }}</div>
        }
        <div class="layout">
          <div class="groups">
            @for (g of groups(); track g.key) {
              @let first = g.entries[0];
              @let leaving = leavingOf(g);
              <ar-panel-card pad="sm" [accent]="g.key === focusKey()">
                <div class="g-head" [class.open]="leaving.length > 0">
                  <span class="slot">{{ label(g) }}</span>
                  <span class="mute">{{ g.entries.length }} na fila</span>
                  <span class="grow"></span>
                  @if (first?.status === 'offered') {
                    <ar-pill tone="yellow">Oferta até {{ dateTime(first.offer?.expiresAt ?? null) }}</ar-pill>
                  } @else {
                    @if (leaving[0]; as l) {
                      <ar-pill tone="green">Vaga abre {{ shortDate(l.sub.endsOn!) }} · {{ l.slot.courtName }}</ar-pill>
                    } @else {
                      <span class="dim">Sem vaga prevista</span>
                    }
                    <button type="button" class="ar-mini-btn" [class.ar-mini-btn-primary]="leaving.length > 0" [disabled]="readOnly() || busy()" (click)="offer(first)">Oferecer ao 1º</button>
                  }
                </div>
                <div class="people">
                  @for (e of visible(g); track e.id; let i = $index) {
                    <div class="person">
                      <span class="pos" [class.first]="i === 0">{{ i + 1 }}º</span>
                      <span class="who"><ar-avatar [name]="e.name" [photoUrl]="e.photoUrl" [size]="26" /><b>{{ e.name }}</b></span>
                      <span class="mute">{{ e.planName }} · {{ e.playersCount }} jogador{{ e.playersCount === 1 ? '' : 'es' }}</span>
                      <span class="since">
                        @if (e.status === 'offered') {
                          <ar-pill tone="orange">Oferta enviada</ar-pill>
                        } @else {
                          desde {{ dayMonth(e.createdAt) }}
                        }
                      </span>
                      <button type="button" class="rm" [disabled]="readOnly()" [attr.aria-label]="'Tirar ' + e.name + ' da fila'" (click)="removing.set(e)">×</button>
                    </div>
                  }
                  @if (g.entries.length > preview && !expanded().has(g.key)) {
                    <button type="button" class="more" (click)="expand(g.key)">+ {{ g.entries.length - preview }} na fila</button>
                  }
                </div>
              </ar-panel-card>
            } @empty {
              <ar-panel-card>
                <p class="state-text">Ninguém na lista de espera. Quando um horário lotar, o atleta entra na fila pelo app e aparece aqui.</p>
              </ar-panel-card>
            }
          </div>

          <div class="side">
            <ar-panel-card title="Quando uma vaga abre" [kicker]="settings().waitlistAutoOffer ? 'Automático' : 'Manual'">
              @for (step of steps(); track $index) {
                <div class="step"><span class="n">{{ $index + 1 }}</span><span>{{ step }}</span></div>
              }
              <div class="toggle-row">
                <span>Oferecer sozinho, sem aprovação</span>
                <ar-toggle [checked]="settings().waitlistAutoOffer" [disabled]="readOnly() || saving()" label="Oferecer sozinho" (changed)="saveRule({ waitlistAutoOffer: $event })" />
              </div>
            </ar-panel-card>
            <ar-panel-card title="Prazo para responder">
              <div class="chip-row">
                @for (h of offerHours; track h) {
                  <button type="button" class="sm-chip" [class.active]="settings().waitlistOfferHours === h" [disabled]="readOnly() || saving()" (click)="saveRule({ waitlistOfferHours: h })">{{ h }}h</button>
                }
              </div>
            </ar-panel-card>
            <ar-panel-card title="Demanda que não cabe" kicker="Fila de agora">
              <div class="lines">
                <ar-ph-line k="Pessoas na fila do nobre" [v]="'' + demand().prime" [strong]="true" />
                <ar-ph-line k="Receita parada na fila" [v]="brl(demand().revenue) + '/mês'" [strong]="true" />
              </div>
              <p class="hint">Cada pessoa da fila vale uma mensalidade quando o horário abrir — ou quando um plano novo cobrir outro dia no mesmo horário.</p>
            </ar-panel-card>
          </div>
        </div>
      }
    </ar-ph-page>

    @if (removing(); as e) {
      <ar-modal (close)="removing.set(null)">
        <p class="modal-title">Tirar {{ e.name }} da fila?</p>
        <p class="modal-sub">Sai da lista de {{ label({ weekdays: e.weekdays, startTime: e.startTime }) }}{{ e.status === 'offered' ? ' e a oferta em aberto deixa de valer' : '' }}. Os próximos sobem uma posição.</p>
        <div class="modal-actions">
          <button type="button" class="ar-mini-btn" [disabled]="busy()" (click)="removing.set(null)">Voltar</button>
          <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="busy()" (click)="remove(e)">{{ busy() ? 'Removendo…' : 'Tirar da fila' }}</button>
        </div>
      </ar-modal>
    }
  `,
  styles: `
    @use 'breakpoints' as ar;
    .layout { display: grid; grid-template-columns: minmax(0, 1fr) 380px; gap: 16px; align-items: start; }
    .groups, .side { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
    .side { gap: 16px; }
    .notice { padding: 10px 14px; border-radius: var(--nx-r-2); background: rgba(43, 209, 126, 0.08); border: 1px solid rgba(43, 209, 126, 0.28); color: var(--nx-win); font-size: 12.5px; }
    .notice.bad { background: rgba(255, 59, 48, 0.08); border-color: var(--nx-live); color: var(--nx-live); }
    .g-head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
    .slot { font-family: var(--nx-font-mono); font-weight: 800; font-size: 15px; color: var(--nx-text); min-width: 110px; }
    .mute { font-size: 12.5px; color: var(--nx-text-mute); }
    .dim { font-size: 12px; color: var(--nx-text-dim); }
    .grow { flex: 1; }
    .people { margin-top: 12px; border-top: 1px solid var(--nx-line); }
    .person { display: grid; grid-template-columns: 28px minmax(0, 1fr) minmax(0, 1fr) 110px 24px; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--nx-line); }
    .person:last-child { border-bottom: none; }
    .pos { font-family: var(--nx-font-mono); font-weight: 800; font-size: 12px; color: var(--nx-text-dim); }
    .pos.first { color: var(--nx-orange-500); }
    .who { display: flex; align-items: center; gap: 10px; min-width: 0; }
    .who b { font-family: var(--nx-font-display); font-weight: 600; font-size: 13px; color: var(--nx-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .since { font-family: var(--nx-font-mono); font-size: 11px; color: var(--nx-text-dim); text-align: right; }
    .rm { width: 24px; height: 24px; border-radius: 6px; border: 1px solid var(--nx-line); background: none; color: var(--nx-text-dim); cursor: pointer; font-size: 14px; line-height: 1; }
    .rm:hover:not(:disabled) { color: var(--nx-live); border-color: rgba(255, 59, 48, 0.4); }
    .more { border: none; background: none; padding: 8px 0 0; cursor: pointer; font-family: var(--nx-font-display); font-weight: 600; font-size: 12px; color: var(--nx-text-dim); }
    .step { display: flex; gap: 12px; padding: 8px 0; font-size: 12.5px; color: var(--nx-text-mute); line-height: 1.45; }
    .n { width: 22px; height: 22px; border-radius: 99px; flex: none; display: grid; place-items: center; background: var(--nx-orange-tint); color: var(--nx-orange-500); font-family: var(--nx-font-mono); font-weight: 800; font-size: 11px; }
    .toggle-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 10px; padding-top: 12px; border-top: 1px solid var(--nx-line); font-size: 12.5px; color: var(--nx-text-mute); }
    .lines { display: flex; flex-direction: column; gap: 9px; }
    @include ar.below(lg) {
      .layout { grid-template-columns: minmax(0, 1fr); }
    }
    @include ar.below(sm) {
      .person { grid-template-columns: 24px minmax(0, 1fr) 24px; }
      .person > .mute, .person > .since { grid-column: 2; }
    }
  `,
})
export class PanelPhWaitlistComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly arenaContext = inject(ArenaContextService);
  private readonly access = inject(ArenaAccessService);
  protected readonly store = inject(SchedulePlansStore);

  protected readonly brl = brl;
  protected readonly shortDate = shortDate;
  protected readonly dateTime = dateTimeShort;
  protected readonly dayMonth = dayMonth;
  protected readonly label = waitlistGroupLabel;
  protected readonly preview = PREVIEW;
  protected readonly offerHours = [12, 24, 48] as const;
  protected readonly readOnly = computed(() => !this.access.canWrite('agenda') || !this.arenaContext.hasCapability('planosHorario'));

  protected readonly focusKey = signal(this.route.snapshot.queryParamMap.get('horario'));
  protected readonly expanded = signal<Set<string>>(new Set(this.focusKey() ? [this.focusKey()!] : []));
  protected readonly removing = signal<ScheduleWaitlistEntry | null>(null);
  protected readonly busy = signal(false);
  protected readonly saving = signal(false);
  protected readonly message = signal<{ text: string; bad: boolean } | null>(null);

  protected readonly settings = computed(() => this.store.settings());
  protected readonly groups = computed(() => groupWaitlist(this.store.waitlist()));
  protected readonly subtitle = computed(() => {
    const people = this.groups().reduce((s, g) => s + g.entries.length, 0);
    const n = this.groups().length;
    return `Lista de espera · ${people} pessoa${people === 1 ? '' : 's'} em ${n} horário${n === 1 ? '' : 's'}`;
  });
  protected readonly steps = computed(() => [
    'O 1º da fila recebe push com o horário e o preço.',
    `Tem ${this.settings().waitlistOfferHours}h para assinar. A cobrança do 1º mês sai na hora.`,
    'Se não responder, passa para o próximo. Sem ninguém, volta para avulso.',
  ]);
  protected readonly demand = computed(() => {
    const plans = this.store.planById();
    const prime = this.settings().primeWindows;
    let inPrime = 0;
    let revenue = 0;
    for (const e of this.store.waitlist()) {
      if (e.status !== 'waiting') continue;
      const plan = plans.get(e.planId);
      if (isInPrime(e.weekdays, e.startTime, plan?.durationMinutes ?? 60, prime)) inPrime++;
      revenue += plan?.monthlyPriceReais ?? 0;
    }
    return { prime: inPrime, revenue };
  });

  protected leavingOf(g: WaitlistGroup) {
    const today = todayKeyLocal();
    return leavingSubsFor(g, this.store.subscriptions()).filter((l) => (l.sub.endsOn ?? '') >= today);
  }

  protected visible(g: WaitlistGroup): ScheduleWaitlistEntry[] {
    return this.expanded().has(g.key) ? g.entries : g.entries.slice(0, PREVIEW);
  }

  protected expand(key: string): void {
    this.expanded.update((s) => new Set([...s, key]));
  }

  protected async offer(entry: ScheduleWaitlistEntry | undefined): Promise<void> {
    if (!entry || this.readOnly()) return;
    this.busy.set(true);
    this.message.set(null);
    try {
      const res = await offerScheduleWaitlist(arenaFunctions(), entry.id);
      this.message.set({ text: `Oferta enviada para ${entry.name} na ${res.courtName}.`, bad: false });
    } catch (err) {
      this.message.set({ text: err instanceof Error ? err.message : 'Não foi possível oferecer a vaga.', bad: true });
    } finally {
      this.busy.set(false);
    }
  }

  protected async remove(entry: ScheduleWaitlistEntry): Promise<void> {
    this.busy.set(true);
    try {
      await removeScheduleWaitlist(arenaFunctions(), entry.id);
      this.removing.set(null);
      this.message.set({ text: `${entry.name} saiu da lista de espera.`, bad: false });
    } catch (err) {
      this.removing.set(null);
      this.message.set({ text: err instanceof Error ? err.message : 'Não foi possível tirar da fila.', bad: true });
    } finally {
      this.busy.set(false);
    }
  }

  protected async saveRule(change: { waitlistAutoOffer?: boolean; waitlistOfferHours?: 12 | 24 | 48 }): Promise<void> {
    const arenaId = this.arenaContext.arenaId();
    if (!arenaId || this.readOnly()) return;
    this.saving.set(true);
    this.message.set(null);
    try {
      await saveScheduleRules(arenaFunctions(), { arenaId, ...change });
    } catch (err) {
      this.message.set({ text: err instanceof Error ? err.message : 'Não foi possível salvar a regra.', bad: true });
    } finally {
      this.saving.set(false);
    }
  }
}
