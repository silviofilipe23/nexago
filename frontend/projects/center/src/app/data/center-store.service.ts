import { Injectable, computed, effect, inject, signal, untracked, type Signal, type WritableSignal } from '@angular/core';
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type DocumentData,
  type Query,
} from 'firebase/firestore';
import { CenterContextService } from '../core/center-context.service';
import { addDays, todayKey } from '../domain/dates';
import type {
  AuditEntry,
  CenterInvite,
  CenterLocation,
  CenterMember,
  ClassSession,
  Court,
  Enrollment,
  Invoice,
  Subscription,
  Plan,
  Program,
  Student,
  TrainingClass,
} from '../domain/models';
import { hasPermission, isManager } from '../domain/roles';
import { CENTERS, db } from './firebase';
import {
  readAudit,
  readClass,
  readCourt,
  readEnrollment,
  readInvite,
  readInvoice,
  readSubscription,
  readLocation,
  readMember,
  readPlan,
  readProgram,
  readSession,
  readStudent,
} from './mappers';

/** Janela de aulas mantida ao vivo: 6 semanas pra trás (presença do mês) até o horizonte gerado. */
const SESSIONS_BACK_DAYS = 42;

interface Feed<T> {
  state: WritableSignal<T[]>;
  loaded: WritableSignal<boolean>;
}

function feed<T>(): Feed<T> {
  return { state: signal<T[]>([]), loaded: signal(false) };
}

/**
 * Dados do centro ativo, ao vivo. Um listener por coleção, aberto só se o papel do usuário tem
 * leitura nela — senão a rule negaria e o listener morreria com erro. Trocar de centro fecha
 * tudo e zera os signals ANTES de reabrir (nada de dado de um centro aparecer no outro).
 */
@Injectable({ providedIn: 'root' })
export class CenterStore {
  private readonly ctx = inject(CenterContextService);

  private readonly f = {
    members: feed<CenterMember>(),
    invites: feed<CenterInvite>(),
    programs: feed<Program>(),
    courts: feed<Court>(),
    locations: feed<CenterLocation>(),
    classes: feed<TrainingClass>(),
    sessions: feed<ClassSession>(),
    students: feed<Student>(),
    plans: feed<Plan>(),
    enrollments: feed<Enrollment>(),
    invoices: feed<Invoice>(),
    subscriptions: feed<Subscription>(),
    audit: feed<AuditEntry>(),
  };

  readonly members: Signal<CenterMember[]> = this.f.members.state.asReadonly();
  readonly invites: Signal<CenterInvite[]> = this.f.invites.state.asReadonly();
  readonly programs = computed(() => [...this.f.programs.state()].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)));
  readonly courts = computed(() => [...this.f.courts.state()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { numeric: true })));
  /** Ativos primeiro, principal no topo. */
  readonly locations = computed(() =>
    [...this.f.locations.state()].sort(
      (a, b) =>
        Number(a.status === 'archived') - Number(b.status === 'archived') ||
        Number(b.isPrimary) - Number(a.isPrimary) ||
        a.name.localeCompare(b.name, 'pt-BR'),
    ),
  );
  readonly classes = computed(() => [...this.f.classes.state()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')));
  readonly sessions: Signal<ClassSession[]> = this.f.sessions.state.asReadonly();
  readonly students = computed(() => [...this.f.students.state()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')));
  readonly plans: Signal<Plan[]> = this.f.plans.state.asReadonly();
  readonly enrollments: Signal<Enrollment[]> = this.f.enrollments.state.asReadonly();
  readonly invoices: Signal<Invoice[]> = this.f.invoices.state.asReadonly();
  readonly subscriptions: Signal<Subscription[]> = this.f.subscriptions.state.asReadonly();
  readonly audit: Signal<AuditEntry[]> = this.f.audit.state.asReadonly();

  /** Professores ativos (pra selects de turma/agenda). */
  readonly coaches = computed(() =>
    this.f.members.state().filter((m) => m.status === 'active' && (m.role === 'coach' || m.role === 'center_owner' || m.role === 'center_admin')),
  );

  readonly loaded = {
    classes: this.f.classes.loaded.asReadonly(),
    students: this.f.students.loaded.asReadonly(),
    enrollments: this.f.enrollments.loaded.asReadonly(),
    invoices: this.f.invoices.loaded.asReadonly(),
    subscriptions: this.f.subscriptions.loaded.asReadonly(),
    plans: this.f.plans.loaded.asReadonly(),
    members: this.f.members.loaded.asReadonly(),
    sessions: this.f.sessions.loaded.asReadonly(),
    programs: this.f.programs.loaded.asReadonly(),
    locations: this.f.locations.loaded.asReadonly(),
    courts: this.f.courts.loaded.asReadonly(),
  };

  programById(id: string): Program | undefined {
    return this.f.programs.state().find((p) => p.id === id);
  }

  locationById(id: string): CenterLocation | undefined {
    return this.f.locations.state().find((l) => l.id === id);
  }

  classById(id: string): TrainingClass | undefined {
    return this.f.classes.state().find((c) => c.id === id);
  }

  studentById(id: string): Student | undefined {
    return this.f.students.state().find((s) => s.id === id);
  }

  planById(id: string): Plan | undefined {
    return this.f.plans.state().find((p) => p.id === id);
  }

  memberByUid(uid: string): CenterMember | undefined {
    return this.f.members.state().find((m) => m.uid === uid);
  }

  /**
   * Chave primitiva do que define os listeners (centro, papel, permissões, fuso). O doc do vínculo
   * e o do centro mudam por qualquer motivo; comparar string evita reabrir tudo à toa.
   */
  private readonly accessKey = computed(() => {
    const me = this.ctx.me();
    const tz = this.ctx.center()?.timezone;
    if (!me || me.status !== 'active' || !tz) {
      return '';
    }
    return [this.ctx.activeCenterId(), me.role, [...me.extraPerms].sort().join(','), tz].join('|');
  });

  constructor() {
    effect((onCleanup) => {
      const key = this.accessKey();
      const centerId = this.ctx.activeCenterId();
      const me = untracked(() => this.ctx.me());
      const tz = untracked(() => this.ctx.center()?.timezone);
      untracked(() => {
        for (const x of Object.values(this.f)) {
          (x as Feed<unknown>).state.set([]);
          (x as Feed<unknown>).loaded.set(false);
        }
      });
      if (!key || !centerId || me?.status !== 'active' || !tz) {
        return;
      }
      const base = (sub: string) => collection(db(), CENTERS, centerId, sub);
      const stops: (() => void)[] = [];
      const listen = <T>(target: Feed<T>, q: Query<DocumentData>, read: (id: string, d: DocumentData) => T) => {
        stops.push(
          onSnapshot(
            q,
            (snap) => {
              target.state.set(snap.docs.map((d) => read(d.id, d.data())));
              target.loaded.set(true);
            },
            (err) => {
              console.warn('[center-store]', err.code ?? err);
              target.state.set([]);
              target.loaded.set(true);
            },
          ),
        );
      };

      const manager = isManager(me);
      const seesEnrollments = hasPermission(me, 'view_enrollments') || hasPermission(me, 'enroll_students');
      const seesFinance = hasPermission(me, 'view_finance');
      const from = addDays(todayKey(tz), -SESSIONS_BACK_DAYS);

      listen(this.f.members, base('centerMembers'), readMember);
      listen(this.f.programs, base('programs'), readProgram);
      listen(this.f.courts, base('courts'), readCourt);
      listen(this.f.locations, base('locations'), readLocation);
      listen(this.f.classes, base('classes'), readClass);
      listen(this.f.plans, base('plans'), readPlan);
      listen(this.f.students, base('students'), readStudent);
      listen(this.f.sessions, query(base('sessions'), where('date', '>=', from)), readSession);
      if (manager) {
        listen(this.f.invites, base('centerInvites'), readInvite);
        listen(this.f.audit, query(base('auditLogs'), orderBy('at', 'desc'), limit(200)), readAudit);
      }
      if (seesEnrollments) {
        listen(this.f.enrollments, base('enrollments'), readEnrollment);
      }
      if (seesFinance) {
        listen(this.f.invoices, base('invoices'), readInvoice);
        listen(this.f.subscriptions, base('subscriptions'), readSubscription);
      }
      onCleanup(() => stops.forEach((s) => s()));
    });
  }
}
