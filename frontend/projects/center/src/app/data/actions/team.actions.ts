import { Injectable } from '@angular/core';
import { collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import type { CenterInvite, CenterMember } from '../../domain/models';
import { ROLE_LABELS, type CenterPermission, type CenterRole } from '../../domain/roles';
import { CENTERS, db } from '../firebase';
import { CenterActionsBase } from './actor';

export interface InviteInput {
  email: string;
  displayName: string;
  role: CenterRole;
  programIds: string[];
  classIds: string[];
}

/**
 * Equipe do centro. Convidar NÃO cria vínculo: grava `centerInvites/{id}` com o e-mail; quem
 * aceita é o próprio convidado (logado com aquele e-mail verificado), e só aí nasce
 * `centerMembers/{uid}` — conta NexaGO única, vínculo separado por centro.
 */
@Injectable({ providedIn: 'root' })
export class TeamActions extends CenterActionsBase {
  async invite(input: InviteInput): Promise<void> {
    const center = this.ctx.center();
    const a = this.actor();
    const ref = this.ref('centerInvites');
    const b = writeBatch(db());
    b.set(ref, {
      centerId: this.centerId(),
      centerName: center?.name ?? '',
      email: input.email.trim().toLowerCase(),
      displayName: input.displayName.trim(),
      role: input.role,
      programIds: input.programIds,
      classIds: input.classIds,
      status: 'pending',
      invitedByUid: a.uid,
      invitedByName: a.name,
      createdAt: serverTimestamp(),
    });
    const audit = this.auditDoc({
      action: 'member.invited',
      entity: 'invite',
      entityId: ref.id,
      detail: `Convite para ${input.email.trim().toLowerCase()} · ${ROLE_LABELS[input.role]}`,
    });
    b.set(audit.ref, audit.data);
    await b.commit();
  }

  async cancelInvite(invite: CenterInvite): Promise<void> {
    const b = writeBatch(db());
    b.update(this.ref('centerInvites', invite.id), { status: 'cancelled' });
    const audit = this.auditDoc({ action: 'member.invite_cancelled', entity: 'invite', entityId: invite.id, detail: `Convite cancelado · ${invite.email}` });
    b.set(audit.ref, audit.data);
    await b.commit();
  }

  /**
   * Aceite pelo convidado — funciona fora do centro ativo (vem da tela "Seus centros"). O vínculo
   * leva o `inviteId`, que a rule relê pra conferir e-mail e papel.
   */
  async acceptInvite(invite: CenterInvite): Promise<void> {
    const uid = this.auth.uid();
    if (!uid) {
      throw new Error('Sessão expirada. Entre de novo.');
    }
    const b = writeBatch(db());
    b.set(doc(db(), CENTERS, invite.centerId, 'centerMembers', uid), {
      uid,
      centerId: invite.centerId,
      centerName: invite.centerName,
      role: invite.role,
      status: 'active',
      displayName: this.auth.displayName(),
      email: this.auth.email() ?? '',
      extraPerms: [],
      programIds: invite.programIds,
      inviteId: invite.id,
      joinedAt: serverTimestamp(),
      revokedAt: null,
    });
    b.update(doc(db(), CENTERS, invite.centerId, 'centerInvites', invite.id), {
      status: 'accepted',
      acceptedUid: uid,
      acceptedAt: serverTimestamp(),
    });
    await b.commit();
    const b2 = writeBatch(db());
    b2.set(doc(collection(db(), CENTERS, invite.centerId, 'auditLogs')), {
      at: serverTimestamp(),
      actorUid: uid,
      actorName: this.auth.displayName(),
      action: 'member.joined',
      entity: 'member',
      entityId: uid,
      detail: `Convite aceito · ${ROLE_LABELS[invite.role]}`,
      reason: '',
    });
    await b2.commit().catch(() => undefined);
  }

  async declineInvite(invite: CenterInvite): Promise<void> {
    const b = writeBatch(db());
    b.update(doc(db(), CENTERS, invite.centerId, 'centerInvites', invite.id), { status: 'declined' });
    await b.commit();
  }

  async updatePermissions(member: CenterMember, extraPerms: CenterPermission[]): Promise<void> {
    const b = writeBatch(db());
    b.update(this.ref('centerMembers', member.uid), { extraPerms });
    const audit = this.auditDoc({
      action: 'member.permissions',
      entity: 'member',
      entityId: member.uid,
      detail: `Permissões de ${member.displayName}: ${extraPerms.length ? extraPerms.join(', ') : 'padrão do papel'}`,
    });
    b.set(audit.ref, audit.data);
    await b.commit();
  }

  async updateAssignment(member: CenterMember, programIds: string[]): Promise<void> {
    const b = writeBatch(db());
    b.update(this.ref('centerMembers', member.uid), { programIds });
    const audit = this.auditDoc({ action: 'member.programs', entity: 'member', entityId: member.uid, detail: `Modalidades de ${member.displayName} atualizadas` });
    b.set(audit.ref, audit.data);
    await b.commit();
  }

  /** Efeito imediato: a próxima leitura/escrita dele já é negada pela rule. Histórico fica. */
  async revoke(member: CenterMember, reason: string): Promise<void> {
    const b = writeBatch(db());
    b.update(this.ref('centerMembers', member.uid), { status: 'revoked', revokedAt: serverTimestamp() });
    const audit = this.auditDoc({ action: 'member.revoked', entity: 'member', entityId: member.uid, detail: `Acesso de ${member.displayName} revogado`, reason });
    b.set(audit.ref, audit.data);
    await b.commit();
  }
}
