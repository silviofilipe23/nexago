import { Injectable } from '@angular/core';
import { collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import {
  DEFAULT_BILLING,
  DEFAULT_LEVELS,
  DEFAULT_POLICIES,
  PROGRAM_COLORS,
  slugify,
  type CenterBilling,
  type CenterPolicies,
  type TrainingCenter,
} from '../../domain/models';
import {
  settingsChanges,
  toFirestore as notificationsToFirestore,
  type NotificationEventKey,
  type NotificationSettings,
} from '../../domain/notification-settings';
import { CENTERS, db, storage } from '../firebase';
import { showcaseImageError, showcaseToFirestore, trialLabel, type CenterShowcase } from '../../domain/showcase';
import { callCenterFunction } from './invoices.actions';
import { CenterActionsBase } from './actor';

export interface NewCenterInput {
  name: string;
  legalName: string;
  cnpj: string;
  contactEmail: string;
  contactPhone: string;
  city: string;
  state: string;
  address: string;
  sports: string[];
  /** Sede própria (vira o local principal) ou `null` para CT itinerante, só em parceiros. */
  hq: { name: string; address: string } | null;
}

export type CenterProfilePatch = Pick<
  TrainingCenter,
  'name' | 'legalName' | 'cnpj' | 'contactEmail' | 'contactPhone' | 'city' | 'state' | 'address' | 'timezone'
>;

const BILLING_LABELS: Record<keyof CenterBilling, string> = {
  billingDayMode: 'Vencimento',
  billingDay: 'Dia de vencimento',
  firstMonth: 'Primeiro mês',
  lateFees: 'Multa e juros',
  blockAfterDays: 'Bloqueio do check-in (dias)',
  suspendAfterDays: 'Suspensão (dias)',
  suspendAction: 'Sem pagamento',
};

const POLICY_LABELS: Partial<Record<keyof CenterPolicies, string>> = {
  activation: 'Ativação da matrícula',
  unexcusedAbsenceConsumes: 'Falta não justificada',
  excusedAbsenceMakeup: 'Falta justificada',
  makeupValidityDays: 'Validade da reposição',
  cancelledClassMakeup: 'Aula cancelada pelo centro',
  makeupScope: 'Onde repor',
  monthlyCancellation: 'Cancelamento de plano mensal',
  allowPause: 'Pausa de matrícula',
  waitlistEnabled: 'Lista de espera',
  pendingHoldHours: 'Reserva da vaga pendente',
  pauseMaxDaysPerYear: 'Limite de trancamento por ano',
  pauseMinDays: 'Trancamento mínimo',
  injuryPauseApproval: 'Aprovação da pausa por lesão',
  injuryCountsInLimit: 'Lesão conta no limite',
  injuryMaxDays: 'Limite da pausa por lesão',
  cancelRetention: 'Ofertas de retenção',
  retentionDiscountPercent: 'Desconto de retenção (%)',
  allowCancelWithdraw: 'Desistir do cancelamento',
  requireMedicalClearance: 'Alta médica para voltar',
  pauseSeat: 'Vaga durante o trancamento',
  waitlistAcceptHours: 'Prazo para aceitar a vaga',
};

function policyText(v: unknown): string {
  return Array.isArray(v) ? (v.length ? v.join(', ') : 'nenhuma') : String(v);
}

/** Cadastro e configurações do centro. */
@Injectable({ providedIn: 'root' })
export class CenterActions extends CenterActionsBase {
  /**
   * Cria o centro em situação PENDENTE com o usuário como owner. Dois passos porque as rules das
   * subcoleções exigem o vínculo já gravado: (1) centro + vínculo do owner num batch, (2)
   * modalidades iniciais + auditoria. Ativar é do backoffice NexaGO.
   */
  async createCenter(input: NewCenterInput): Promise<string> {
    const a = this.actor();
    const email = this.auth.email() ?? '';
    const centerRef = doc(collection(db(), CENTERS));
    const id = centerRef.id;
    const name = input.name.trim();

    const b1 = writeBatch(db());
    b1.set(centerRef, {
      name,
      legalName: input.legalName.trim(),
      cnpj: input.cnpj.trim(),
      slug: slugify(name) || id,
      timezone: 'America/Sao_Paulo',
      sports: input.sports,
      status: 'pending',
      ownerUid: a.uid,
      ownerName: this.auth.displayName(),
      contactEmail: input.contactEmail.trim().toLowerCase(),
      contactPhone: input.contactPhone.trim(),
      city: input.city.trim(),
      state: input.state.trim().toUpperCase(),
      address: input.address.trim(),
      policies: { ...DEFAULT_POLICIES },
      billing: { ...DEFAULT_BILLING },
      receivingConnected: false,
      subscription: null,
      createdAt: serverTimestamp(),
    });
    b1.set(doc(db(), CENTERS, id, 'centerMembers', a.uid), {
      uid: a.uid,
      centerId: id,
      centerName: name,
      role: 'center_owner',
      status: 'active',
      displayName: this.auth.displayName(),
      email,
      extraPerms: [],
      programIds: [],
      inviteId: null,
      joinedAt: serverTimestamp(),
    });
    await b1.commit();

    const b2 = writeBatch(db());
    input.sports.forEach((sport, i) => {
      b2.set(doc(collection(db(), CENTERS, id, 'programs')), {
        name: sport,
        color: PROGRAM_COLORS[i % PROGRAM_COLORS.length],
        levels: [...DEFAULT_LEVELS],
        order: i,
      });
    });
    if (input.hq) {
      b2.set(doc(collection(db(), CENTERS, id, 'locations')), {
        name: input.hq.name.trim() || 'Sede',
        type: 'own',
        address: input.hq.address.trim(),
        notes: '',
        isPrimary: true,
        status: 'active',
        windows: [],
        courtsLabel: '',
        contactName: '',
        contactPhone: '',
        archivedAt: null,
      });
    }
    b2.set(doc(collection(db(), CENTERS, id, 'auditLogs')), {
      at: serverTimestamp(),
      actorUid: a.uid,
      actorName: this.auth.displayName(),
      action: 'center.created',
      entity: 'center',
      entityId: id,
      detail: `Centro criado · ${name}`,
      reason: '',
    });
    await b2.commit();
    return id;
  }

  async updateProfile(patch: CenterProfilePatch): Promise<void> {
    const b = writeBatch(db());
    b.update(this.centerRef(), {
      ...patch,
      name: patch.name.trim(),
      contactEmail: patch.contactEmail.trim().toLowerCase(),
      state: patch.state.trim().toUpperCase(),
    });
    const audit = this.auditDoc({ action: 'center.profile', entity: 'center', entityId: this.centerId(), detail: 'Dados do centro atualizados' });
    b.set(audit.ref, audit.data);
    await b.commit();
  }

  /** Vitrine no app do atleta. A capa já subiu pelo [uploadShowcaseCover]; aqui só a URL. */
  async updateShowcase(next: CenterShowcase): Promise<void> {
    const value = showcaseToFirestore(next);
    const b = writeBatch(db());
    b.update(this.centerRef(), { showcase: value });
    const detail = [
      value.coverUrl ? 'com capa' : 'sem capa',
      value.description ? 'descrição preenchida' : 'sem descrição',
      trialLabel(value.trial),
    ].join(' · ');
    const audit = this.auditDoc({ action: 'center.showcase', entity: 'center', entityId: this.centerId(), detail: `Vitrine no app: ${detail}` });
    b.set(audit.ref, audit.data);
    await b.commit();
  }

  /** Sobe a capa para `trainingCenters/{centerId}/cover` (nome fixo: o novo envio substitui). */
  async uploadShowcaseCover(file: File): Promise<string> {
    const error = showcaseImageError(file);
    if (error) throw new Error(error);
    const fileRef = ref(storage(), `${CENTERS}/${this.centerId()}/cover`);
    await uploadBytes(fileRef, file, { contentType: file.type });
    return getDownloadURL(fileRef);
  }

  /** Políticas valem para NOVOS contratos — matrículas guardam a cópia do dia da contratação. */
  async updatePolicies(before: CenterPolicies, next: CenterPolicies, reason: string): Promise<void> {
    const changed = (Object.keys(next) as (keyof CenterPolicies)[]).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(next[k]));
    if (changed.length === 0) {
      return;
    }
    const b = writeBatch(db());
    b.update(this.centerRef(), { policies: next });
    const detail = changed
      .map((k) => `${POLICY_LABELS[k] ?? k}: ${policyText(before[k])} → ${policyText(next[k])}`)
      .join(' · ');
    const audit = this.auditDoc({ action: 'center.policies', entity: 'center', entityId: this.centerId(), detail, reason });
    b.set(audit.ref, audit.data);
    await b.commit();
  }

  async updateBilling(before: CenterBilling, next: CenterBilling): Promise<void> {
    const changed = (Object.keys(next) as (keyof CenterBilling)[]).filter((k) => before[k] !== next[k]);
    if (changed.length === 0) {
      return;
    }
    this.assertWritable();
    const b = writeBatch(db());
    b.update(this.centerRef(), { billing: next });
    const detail = changed.map((k) => `${BILLING_LABELS[k]}: ${String(before[k])} → ${String(next[k])}`).join(' · ');
    const audit = this.auditDoc({ action: 'center.billing', entity: 'center', entityId: this.centerId(), detail });
    b.set(audit.ref, audit.data);
    await b.commit();
  }

  async updateNotifications(before: NotificationSettings, next: NotificationSettings): Promise<void> {
    const changes = settingsChanges(before, next);
    if (changes.length === 0) {
      return;
    }
    this.assertWritable();
    const b = writeBatch(db());
    b.update(this.centerRef(), { notifications: notificationsToFirestore(next) });
    const audit = this.auditDoc({ action: 'center.notifications', entity: 'center', entityId: this.centerId(), detail: changes.join(' · ') });
    b.set(audit.ref, audit.data);
    await b.commit();
  }

  /** Push de exemplo para quem está logado (callable; só owner/admin). */
  sendTestNotification(event: NotificationEventKey): Promise<{ sent: boolean }> {
    return callCenterFunction<{ sent: boolean }>('sendTrainingCenterTestNotification', { centerId: this.centerId(), event });
  }

  async requestActivation(): Promise<void> {
    const b = writeBatch(db());
    b.update(this.centerRef(), { activationRequestedAt: serverTimestamp() });
    const audit = this.auditDoc({ action: 'center.activation_requested', entity: 'center', entityId: this.centerId(), detail: 'Ativação solicitada ao time NexaGO' });
    b.set(audit.ref, audit.data);
    await b.commit();
  }

  /**
   * Registra a tentativa de acesso negado (W6). Qualquer membro ativo pode criar a linha; se o
   * usuário nem tem vínculo com o centro, a rule nega e a falha é silenciosa.
   */
  async logDenied(centerId: string, area: string, roleLabel: string): Promise<void> {
    const a = this.actor();
    const b = writeBatch(db());
    b.set(doc(collection(db(), CENTERS, centerId, 'auditLogs')), {
      at: serverTimestamp(),
      actorUid: a.uid,
      actorName: this.auth.displayName(),
      action: 'access.denied',
      entity: 'area',
      entityId: area,
      detail: `Acesso negado a ${area} (papel: ${roleLabel})`,
      reason: '',
    });
    await b.commit();
  }
}
