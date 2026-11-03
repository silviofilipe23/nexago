import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';
import type { Unsubscribe } from 'firebase/firestore';
import { todayKeyLocal } from '../aulas/class.model';
import type { ArenaCourt } from '../courts/court.model';
import { fetchCourtsList } from '../courts/courts-repository';
import { ArenaContextService } from '../data/arena-context.service';
import { arenaFirestore } from '../data/firestore';
import { subscriberState, type SubscriberState } from './schedule-plan.logic';
import {
  DEFAULT_SETTINGS,
  type ScheduleCharge,
  type SchedulePlan,
  type ScheduleSettings,
  type ScheduleSubscription,
  type ScheduleWaitlistEntry,
} from './schedule-plan.model';
import { watchOpenCharges, watchPlans, watchSettings, watchSubscriptions, watchWaitlist } from './schedule-plan-repository';

/** Tempo que os listeners ficam vivos depois que a última aba sai (troca de aba não relê tudo). */
const TEARDOWN_DELAY_MS = 30_000;
const SOURCES = 5;

/** Estado compartilhado das 4 abas de Planos de horário: planos, regras, assinaturas, mensalidades
 *  abertas e fila, ao vivo. Cada tela chama `attach()`; sem ninguém olhando, os listeners caem. */
@Injectable({ providedIn: 'root' })
export class SchedulePlansStore {
  private readonly arenaContext = inject(ArenaContextService);

  readonly plans = signal<SchedulePlan[]>([]);
  readonly settings = signal<ScheduleSettings>(DEFAULT_SETTINGS);
  readonly subscriptions = signal<ScheduleSubscription[]>([]);
  readonly openCharges = signal<ScheduleCharge[]>([]);
  readonly waitlist = signal<ScheduleWaitlistEntry[]>([]);
  readonly courts = signal<ArenaCourt[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);

  readonly activeCourts = computed(() => this.courts().filter((c) => c.status === 'active'));
  readonly visiblePlans = computed(() =>
    this.plans()
      .filter((p) => p.status !== 'archived')
      .sort((a, b) => (a.status === b.status ? a.name.localeCompare(b.name, 'pt-BR') : a.status === 'active' ? -1 : 1)),
  );
  readonly planById = computed(() => new Map(this.plans().map((p) => [p.id, p])));
  readonly subById = computed(() => new Map(this.subscriptions().map((s) => [s.id, s])));
  readonly chargesBySub = computed(() => {
    const out = new Map<string, ScheduleCharge[]>();
    for (const c of this.openCharges()) out.set(c.subscriptionId, [...(out.get(c.subscriptionId) ?? []), c]);
    return out;
  });
  /** Situação de cada assinatura, recalculada a cada snapshot. */
  readonly states = computed(() => {
    const today = todayKeyLocal();
    const bySub = this.chargesBySub();
    return new Map<string, SubscriberState>(this.subscriptions().map((s) => [s.id, subscriberState(s, bySub.get(s.id) ?? [], today)]));
  });
  readonly waitingCount = computed(() => this.waitlist().filter((w) => w.status === 'waiting' || w.status === 'offered').length);

  private arenaId: string | null = null;
  private unsubs: Unsubscribe[] = [];
  private refs = 0;
  private teardownTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      const arenaId = this.arenaContext.arenaId();
      if (this.refs > 0 && arenaId && arenaId !== this.arenaId) this.start(arenaId);
    });
  }

  /** Liga os listeners enquanto a tela existir. */
  attach(destroyRef: DestroyRef): void {
    this.refs++;
    if (this.teardownTimer) {
      clearTimeout(this.teardownTimer);
      this.teardownTimer = null;
    }
    const arenaId = this.arenaContext.arenaId();
    if (arenaId && arenaId !== this.arenaId) this.start(arenaId);
    destroyRef.onDestroy(() => {
      this.refs = Math.max(0, this.refs - 1);
      if (this.refs === 0) this.teardownTimer = setTimeout(() => this.stop(), TEARDOWN_DELAY_MS);
    });
  }

  private start(arenaId: string): void {
    this.stop();
    this.arenaId = arenaId;
    this.loading.set(true);
    this.loadError.set(null);
    this.plans.set([]);
    this.subscriptions.set([]);
    this.openCharges.set([]);
    this.waitlist.set([]);
    this.settings.set(DEFAULT_SETTINGS);

    const db = arenaFirestore();
    const seen = new Set<number>();
    const ready = (i: number) => {
      seen.add(i);
      if (seen.size >= SOURCES) this.loading.set(false);
    };
    const fail = () => {
      this.loadError.set('Não foi possível carregar os planos de horário.');
      this.loading.set(false);
    };
    this.unsubs = [
      watchPlans(db, arenaId, (v) => (this.plans.set(v), ready(0)), fail),
      watchSettings(db, arenaId, (v) => (this.settings.set(v), ready(1)), () => ready(1)),
      watchSubscriptions(db, arenaId, (v) => (this.subscriptions.set(v), ready(2)), fail),
      watchOpenCharges(db, arenaId, (v) => (this.openCharges.set(v), ready(3)), fail),
      watchWaitlist(db, arenaId, (v) => (this.waitlist.set(v), ready(4)), fail),
    ];
    void fetchCourtsList(db, arenaId)
      .then((courts) => {
        if (this.arenaId === arenaId) this.courts.set(courts);
      })
      .catch(() => this.courts.set([]));
  }

  private stop(): void {
    for (const u of this.unsubs) u();
    this.unsubs = [];
    this.arenaId = null;
    this.teardownTimer = null;
  }
}
