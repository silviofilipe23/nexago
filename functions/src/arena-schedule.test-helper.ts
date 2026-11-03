/**
 * Fixtures dos testes de Planos de horário (fora do glob `*.test.js`): arena Pro, plano, atletas,
 * quadras e o push trocado por um gravador.
 */
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore, type DocData} from "./fake-firestore.test-helper";
import {DEFAULT_PLAN_RULES} from "./arena-schedule-plan-constants";
import {scheduleNotifier} from "./arena-schedule-plans";
import {addDaysToDateKey, isoWeekdayOfDateKey} from "./arena-recurring-booking";
import {dayKeyFromEventDate} from "./event-timezone";

export const ARENA = "a1";
export const MANAGER = "mgr";

export const pushes: Array<{userId: string; type: string}> = [];
scheduleNotifier.send = async (input) => {
  pushes.push({userId: input.userId, type: input.type});
  return {sent: 1, failed: 0};
};

export function makeDb(): {fake: FakeFirestore; db: Firestore} {
  const fake = new FakeFirestore();
  return {fake, db: fake as unknown as Firestore};
}

export function planData(overrides: DocData = {}): DocData {
  return {
    arenaId: ARENA,
    name: "Fixo 1x",
    description: null,
    status: "active",
    timesPerWeek: 1,
    durationMinutes: 60,
    windows: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({weekday, startTime: "07:00", endTime: "23:00"})),
    courtIds: ["q1", "q2", "q3"],
    courtNames: ["Quadra 1", "Quadra 2", "Quadra 3"],
    capacity: 10,
    occupiedCount: 0,
    waitingCount: 0,
    monthlyPriceReais: 300,
    referenceHourlyReais: null,
    cycles: {monthly: {enabled: true}, quarterly: {enabled: true, discountPercent: 5}, annual: {enabled: true, discountPercent: 10}},
    billing: {methods: ["pix_auto", "card", "onsite"], dueDay: 5, overdueReleaseDays: 3},
    rules: DEFAULT_PLAN_RULES,
    ...overrides,
  };
}

/** Arena Pro com gestor, quadras q1..q3, atletas e o plano `p1`. */
export function seedArena(fake: FakeFirestore, opts: {courts?: string[]; plan?: DocData; athletes?: string[]} = {}): void {
  fake.seedDoc(`arenas/${ARENA}`, {name: "Arena CFC", managerUserId: MANAGER, planTier: "pro", planStatus: "active"});
  for (const c of opts.courts ?? ["q1", "q2", "q3"]) {
    fake.seedDoc(`arenas/${ARENA}/courts/${c}`, {name: `Quadra ${c.slice(1)}`});
  }
  fake.seedDoc(`arenas/${ARENA}/schedulePlans/p1`, planData(opts.plan));
  for (const uid of opts.athletes ?? ["u1", "u2", "u3", "u4"]) {
    fake.seedDoc(`users/${uid}`, {fullName: `Atleta ${uid}`, phoneNumber: "+5562999990000"});
  }
}

export function today(): string {
  return dayKeyFromEventDate(new Date());
}

/** Dia da semana daqui a `days` dias (data futura com ocorrência materializada). */
export function weekdayIn(days: number): number {
  return isoWeekdayOfDateKey(addDaysToDateKey(today(), days));
}

export function holder(uid: string) {
  return {athleteId: uid, name: `Atleta ${uid}`, phone: null, photoUrl: null};
}

export function docsIn(fake: FakeFirestore, prefix: string): Array<[string, DocData]> {
  return [...fake.store.entries()].filter(([p]) => p.startsWith(prefix));
}
