import { Injectable, computed, effect, signal, untracked } from '@angular/core';
import {
  Timestamp,
  arrayUnion,
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
  type DocumentData,
} from 'firebase/firestore';
import { CenterActionsBase } from '../../data/actions/actor';
import { callCenterFunction } from '../../data/actions/invoices.actions';
import { CENTERS, db } from '../../data/firebase';
import { hasPermission } from '../../domain/roles';
import {
  DEFAULT_LEAD_SETTINGS,
  LOST_LABEL,
  STAGE_LABEL,
  phoneDigits,
  readLead,
  readLeadSettings,
  type Lead,
  type LeadExperience,
  type LeadHistoryKind,
  type LeadPeriod,
  type LeadSettings,
  type LeadSource,
  type LeadStage,
  type LostReason,
} from './lead-model';

/** Funil mantido ao vivo (os mais recentes). */
const LEADS_LIMIT = 500;

export interface LeadInput {
  name: string;
  phone: string;
  email: string;
  age: number | null;
  source: LeadSource;
  referredBy: string;
  programId: string;
  programName: string;
  experience: LeadExperience;
  period: LeadPeriod;
  goal: string;
  note: string;
}

/**
 * Captação do centro ativo: interessados + configuração, ao vivo, e as ações. Fica fora do
 * `CenterStore` (só quem matricula lê `leads`): o listener abre ao entrar na área e segue enquanto
 * o centro não muda. Escrita direta pelas rules; experimental e avaliação pelas callables.
 */
@Injectable({ providedIn: 'root' })
export class LeadsService extends CenterActionsBase {
  private readonly leadsState = signal<Lead[]>([]);
  private readonly settingsState = signal<LeadSettings>(DEFAULT_LEAD_SETTINGS);
  private readonly loadedState = signal(false);
  private readonly errorState = signal('');
  private readonly wanted = signal(false);

  readonly leads = this.leadsState.asReadonly();
  readonly settings = this.settingsState.asReadonly();
  readonly loaded = this.loadedState.asReadonly();
  readonly error = this.errorState.asReadonly();

  private readonly key = computed(() => {
    const me = this.ctx.me();
    const centerId = this.ctx.activeCenterId();
    if (!this.wanted() || !centerId || !me || !hasPermission(me, 'enroll_students')) return '';
    return centerId;
  });

  constructor() {
    super();
    effect((onCleanup) => {
      const centerId = this.key();
      untracked(() => {
        this.leadsState.set([]);
        this.settingsState.set(DEFAULT_LEAD_SETTINGS);
        this.loadedState.set(false);
        this.errorState.set('');
      });
      if (!centerId) return;
      const stops = [
        onSnapshot(
          query(collection(db(), CENTERS, centerId, 'leads'), orderBy('updatedAt', 'desc'), limit(LEADS_LIMIT)),
          (snap) => {
            this.leadsState.set(snap.docs.map((d) => readLead(d.id, d.data())));
            this.loadedState.set(true);
          },
          (err) => {
            console.warn('[leads]', err.code ?? err);
            this.errorState.set('Não foi possível carregar os interessados.');
            this.loadedState.set(true);
          },
        ),
        onSnapshot(
          doc(db(), CENTERS, centerId, 'settings', 'leads'),
          (snap) => this.settingsState.set(readLeadSettings(snap.data() as DocumentData | undefined)),
          (err) => console.warn('[leads] settings', err.code ?? err),
        ),
      ];
      onCleanup(() => stops.forEach((s) => s()));
    });
  }

  /** Abre os listeners (chamado pelas telas da Captação). */
  watch(): void {
    this.wanted.set(true);
  }

  byId(id: string): Lead | undefined {
    return this.leadsState().find((l) => l.id === id);
  }

  private entry(kind: LeadHistoryKind, text: string): Record<string, unknown> {
    return { at: Timestamp.now(), byName: this.actor().name, kind, text: text.slice(0, 300) };
  }

  async create(input: LeadInput, stage: 'new' | 'contacted' = 'new'): Promise<string> {
    this.assertWritable();
    const a = this.actor();
    const ref = this.ref('leads');
    const history = [this.entry('created', `Cadastrou · ${input.note.trim() || 'origem ' + input.source}`)];
    const b = writeBatch(db());
    b.set(ref, {
      name: input.name.trim(),
      phone: input.phone.trim(),
      phoneDigits: phoneDigits(input.phone),
      email: input.email.trim().toLowerCase(),
      age: input.age,
      source: input.source,
      referredBy: input.referredBy.trim(),
      interest: {
        programId: input.programId,
        programName: input.programName,
        experience: input.experience,
        period: input.period,
        goal: input.goal.trim(),
      },
      stage,
      lostReason: null,
      ownerUid: a.uid,
      ownerName: a.name,
      athleteId: null,
      studentId: null,
      enrollmentId: null,
      proposalUntil: null,
      trial: null,
      coachFeedback: null,
      trialsCount: 0,
      history,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      firstContactAt: stage === 'contacted' ? serverTimestamp() : null,
      createdByUid: a.uid,
      createdByName: a.name,
    });
    const audit = this.auditDoc({ action: 'lead.created', entity: 'lead', entityId: ref.id, detail: `${input.name.trim()} entrou na captação` });
    b.set(audit.ref, audit.data);
    await b.commit();
    return ref.id;
  }

  async update(l: Lead, input: LeadInput): Promise<void> {
    this.assertWritable();
    const b = writeBatch(db());
    b.update(this.ref('leads', l.id), {
      name: input.name.trim(),
      phone: input.phone.trim(),
      phoneDigits: phoneDigits(input.phone),
      email: input.email.trim().toLowerCase(),
      age: input.age,
      source: input.source,
      referredBy: input.referredBy.trim(),
      interest: {
        programId: input.programId,
        programName: input.programName,
        experience: input.experience,
        period: input.period,
        goal: input.goal.trim(),
      },
      history: arrayUnion(this.entry('note', 'Atualizou o cadastro')),
      updatedAt: serverTimestamp(),
    });
    await b.commit();
  }

  /** Move no funil (arrastar/menu). Sair de "Novo" marca o 1º contato (tempo de resposta). */
  async moveTo(l: Lead, stage: LeadStage, lostReason: LostReason | null = null): Promise<void> {
    this.assertWritable();
    const text = stage === 'lost' ? `Marcou como perdido · ${LOST_LABEL[lostReason ?? 'other']}` : `Moveu para ${STAGE_LABEL[stage]}`;
    await setDoc(
      this.ref('leads', l.id),
      {
        stage,
        lostReason: stage === 'lost' ? (lostReason ?? 'other') : null,
        ...(l.stage === 'new' && stage !== 'new' && !l.firstContactAt ? { firstContactAt: serverTimestamp() } : {}),
        history: arrayUnion(this.entry(stage === 'lost' ? 'lost' : 'stage', text)),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  }

  /** Contato ou nota livre ("Registrar contato ou nota…"). Contato tira de "Novo". */
  async addNote(l: Lead, text: string, kind: 'contact' | 'note' = 'note'): Promise<void> {
    this.assertWritable();
    const promote = kind === 'contact' && l.stage === 'new';
    await setDoc(
      this.ref('leads', l.id),
      {
        ...(promote ? { stage: 'contacted' } : {}),
        ...(l.stage === 'new' && !l.firstContactAt ? { firstContactAt: serverTimestamp() } : {}),
        history: arrayUnion(this.entry(kind, text.trim())),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  }

  /** Aluno criado a partir do interessado (antes da matrícula). */
  async linkStudent(l: Lead, studentId: string): Promise<void> {
    await setDoc(
      this.ref('leads', l.id),
      { studentId, history: arrayUnion(this.entry('note', 'Virou aluno do centro')), updatedAt: serverTimestamp() },
      { merge: true },
    );
  }

  /** Matrícula criada (C4): interessado vai para "Matriculados". */
  async markWon(l: Lead, enrollmentId: string, className: string): Promise<void> {
    this.assertWritable();
    const b = writeBatch(db());
    b.update(this.ref('leads', l.id), {
      stage: 'won',
      lostReason: null,
      enrollmentId,
      history: arrayUnion(this.entry('won', `Matriculou${className ? ' em ' + className : ''}`)),
      updatedAt: serverTimestamp(),
    });
    const audit = this.auditDoc({ action: 'lead.won', entity: 'lead', entityId: l.id, detail: `${l.name} matriculado pela captação` });
    b.set(audit.ref, audit.data);
    await b.commit();
  }

  scheduleTrial(leadId: string, sessionId: string): Promise<{ bookingId: string }> {
    return callCenterFunction('scheduleTrainingCenterLeadTrial', { centerId: this.centerId(), leadId, sessionId });
  }

  cancelTrial(bookingId: string): Promise<{ bookingId: string }> {
    return callCenterFunction('cancelTrainingCenterLeadTrial', { centerId: this.centerId(), bookingId });
  }

  /** Configurações › Captação (só o gestor; as rules validam o formato). */
  async saveSettings(s: LeadSettings): Promise<void> {
    this.assertWritable();
    const b = writeBatch(db());
    b.set(this.ref('settings', 'leads'), { ...s });
    const audit = this.auditDoc({
      action: 'center.leads_settings',
      entity: 'center',
      entityId: this.centerId(),
      detail: `Captação: ${s.publicPage ? 'página pública ligada' : 'página pública desligada'} · ${s.maxTrialsPerSession} experimental(is) por aula`,
    });
    b.set(audit.ref, audit.data);
    await b.commit();
  }
}
