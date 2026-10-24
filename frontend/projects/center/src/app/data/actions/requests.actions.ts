import { Injectable } from '@angular/core';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import type { EnrollmentRequestStatus, EnrollmentRequestType } from '../../domain/models';
import { storage } from '../firebase';
import { CenterActionsBase } from './actor';
import { callCenterFunction } from './invoices.actions';

export type RequestDecision = 'approve' | 'reject' | 'needs_document' | 'undo';

/** Atestado já enviado ao Storage, como a callable espera. */
export interface CertificatePayload {
  path: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  issuedOn: string;
  daysOff: number;
  doctor: string;
  description: string;
}

export interface DeskRequestInput {
  enrollmentId: string;
  type: EnrollmentRequestType;
  startsOn?: string;
  days?: number;
  reason: string;
  comment?: string;
  certificate?: CertificatePayload | null;
}

export interface DeskRequestResult {
  requestId: string;
  status: EnrollmentRequestStatus;
  startsOn: string | null;
  endsOn: string | null;
  lastDay: string | null;
}

export const CERTIFICATE_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'];
export const CERTIFICATE_MAX_BYTES = 10 * 1024 * 1024;

/**
 * Trancar, pausa por lesão e cancelar (`enrollmentRequests`). Tudo passa pelas callables
 * (`training-center-enrollment-requests.ts`): só o servidor grava o pedido, a matrícula e a
 * assinatura juntos, com auditoria e push ao aluno.
 */
@Injectable({ providedIn: 'root' })
export class RequestsActions extends CenterActionsBase {
  /** Owner/admin aprovam, recusam, pedem outro documento ou desfazem um pedido agendado. */
  decide(requestId: string, decision: RequestDecision, note: string): Promise<{ status: EnrollmentRequestStatus }> {
    this.assertWritable();
    return callCenterFunction('decideTrainingCenterEnrollmentRequest', { centerId: this.centerId(), requestId, decision, note });
  }

  /** Registro no balcão (owner/admin): a lesão é aprovada direto e o atestado é opcional. */
  register(input: DeskRequestInput): Promise<DeskRequestResult> {
    this.assertWritable();
    const payload: Record<string, unknown> = { centerId: this.centerId(), ...input };
    if (!input.certificate) delete payload['certificate'];
    return callCenterFunction('requestTrainingCenterEnrollmentChange', payload);
  }

  /** Link temporário do atestado (rules: só owner/admin do centro e o próprio aluno leem). */
  certificateUrl(path: string): Promise<string> {
    return getDownloadURL(ref(storage(), path));
  }

  /** Sobe o atestado trazido ao balcão na pasta de quem registra (a rule só deixa gravar na própria). */
  async uploadCertificate(file: File): Promise<Pick<CertificatePayload, 'path' | 'fileName' | 'contentType' | 'sizeBytes'>> {
    if (!CERTIFICATE_TYPES.includes(file.type)) throw new Error('O atestado precisa ser PDF ou foto.');
    if (file.size > CERTIFICATE_MAX_BYTES) throw new Error('O atestado pode ter até 10 MB.');
    const safe = file.name.replace(/[^\w.-]+/g, '_').slice(-80) || 'atestado';
    const path = `trainingCenterCertificates/${this.centerId()}/${this.actor().uid}/${Date.now()}-${safe}`;
    await uploadBytes(ref(storage(), path), file, { contentType: file.type });
    return { path, fileName: file.name.slice(0, 120), contentType: file.type, sizeBytes: file.size };
  }
}
