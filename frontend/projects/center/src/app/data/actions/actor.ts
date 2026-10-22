import { inject } from '@angular/core';
import { collection, doc, serverTimestamp, type DocumentReference } from 'firebase/firestore';
import { AuthService } from '../../auth/auth.service';
import { CenterContextService } from '../../core/center-context.service';
import { CENTERS, db } from '../firebase';

export interface Actor {
  uid: string;
  name: string;
}

export interface AuditInput {
  action: string;
  entity: string;
  entityId: string;
  detail: string;
  reason?: string;
}

/**
 * Base das ações: quem está agindo e em qual centro. Toda escrita relevante vai junto (mesmo
 * batch/transação) de uma linha em `auditLogs` — a trilha que o owner vê e que as rules só
 * deixam CRIAR (nunca editar nem apagar).
 */
export abstract class CenterActionsBase {
  protected readonly auth = inject(AuthService);
  protected readonly ctx = inject(CenterContextService);

  protected actor(): Actor {
    const uid = this.auth.uid();
    if (!uid) {
      throw new Error('Sessão expirada. Entre de novo.');
    }
    return { uid, name: this.ctx.me()?.displayName || this.auth.displayName() };
  }

  protected centerId(): string {
    const id = this.ctx.activeCenterId();
    if (!id) {
      throw new Error('Nenhum centro selecionado.');
    }
    return id;
  }

  protected ref(sub: string, id?: string): DocumentReference {
    const c = collection(db(), CENTERS, this.centerId(), sub);
    return id ? doc(c, id) : doc(c);
  }

  protected centerRef(): DocumentReference {
    return doc(db(), CENTERS, this.centerId());
  }

  protected auditDoc(input: AuditInput): { ref: DocumentReference; data: Record<string, unknown> } {
    const a = this.actor();
    return {
      ref: this.ref('auditLogs'),
      data: {
        at: serverTimestamp(),
        actorUid: a.uid,
        actorName: a.name,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId,
        detail: input.detail,
        reason: input.reason ?? '',
      },
    };
  }

  protected assertWritable(): void {
    if (this.ctx.isSuspended()) {
      throw new Error('Centro suspenso: somente leitura até regularizar a assinatura.');
    }
  }
}

/** Mensagem amigável pra erro de escrita no Firestore. */
export function writeErrorMessage(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? String((error as { code: string }).code) : '';
  if (code === 'permission-denied') {
    return 'Sem permissão para esta ação neste centro.';
  }
  if (code === 'unavailable') {
    return 'Sem conexão. Tente de novo.';
  }
  if (code === 'failed-precondition' || code === 'aborted') {
    return 'Os dados mudaram enquanto você editava. Tente de novo.';
  }
  return error instanceof Error ? error.message : 'Não foi possível concluir. Tente de novo.';
}
