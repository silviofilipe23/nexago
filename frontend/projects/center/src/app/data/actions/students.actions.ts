import { Injectable } from '@angular/core';
import { collection, getDocs, limit, query, serverTimestamp, where, writeBatch } from 'firebase/firestore';
import { normalizeSearchTerm } from '@nexago/search-keywords';
import type { Guardian, Student, StudentStatus } from '../../domain/models';
import { db } from '../firebase';
import { CenterActionsBase } from './actor';

export interface AccountHit {
  uid: string;
  name: string;
  sub: string;
  photoUrl: string | null;
}

export interface StudentInput {
  uid: string | null;
  name: string;
  email: string;
  phone: string;
  isMinor: boolean;
  birthDate: string | null;
  guardian: Guardian | null;
  imageUseAllowed: boolean;
  notifyClasses: boolean;
  emergencyName: string;
  emergencyPhone: string;
  medicalNotes: string;
}

const STATUS_LABEL: Record<StudentStatus, string> = {
  active: 'ativo',
  invited: 'convidado',
  inactive: 'inativo',
  blocked: 'bloqueado',
};

function firstString(d: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = d[k];
    if (typeof v === 'string' && v.trim()) {
      return v.trim();
    }
  }
  return '';
}

/**
 * Alunos do centro. Um aluno pode ter conta NexaGO (a mesma do atleta nos torneios, achada pelo
 * diretório público `public_profiles`) ou ser só convidado por e-mail. O centro guarda os dados
 * de contato/responsável no próprio doc — nunca lê `users/{uid}` (PII) de outra pessoa.
 */
@Injectable({ providedIn: 'root' })
export class StudentsActions extends CenterActionsBase {
  /** Busca no diretório público pelas mesmas `keywords` da busca de atleta do app. */
  async searchAccounts(term: string): Promise<AccountHit[]> {
    const tokens = term
      .split(/\s+/)
      .map((t) => normalizeSearchTerm(t))
      .filter((t) => t.length >= 2);
    if (tokens.length === 0) {
      return [];
    }
    const longest = [...tokens].sort((a, b) => b.length - a.length)[0]!;
    const snap = await getDocs(
      query(collection(db(), 'public_profiles'), where('keywords', 'array-contains', longest), limit(20)),
    );
    return snap.docs
      .map((d) => {
        const data = d.data() as Record<string, unknown>;
        const keywords = Array.isArray(data['keywords']) ? (data['keywords'] as string[]) : [];
        return { d, data, keywords };
      })
      .filter(({ keywords }) => tokens.every((t) => keywords.includes(t)))
      .slice(0, 8)
      .map(({ d, data }) => {
        const name = firstString(data, ['fullName', 'name', 'nickname']) || 'Atleta';
        const city = firstString(data, ['city']);
        const sport = firstString(data, ['primarySport', 'sport']);
        return {
          uid: d.id,
          name,
          sub: [sport, city].filter(Boolean).join(' · ') || 'Conta NexaGO',
          photoUrl: firstString(data, ['profilePhotoUrl', 'avatarUrl', 'photoURL']) || null,
        };
      });
  }

  async addStudent(input: StudentInput): Promise<string> {
    this.assertWritable();
    const ref = this.ref('students');
    const b = writeBatch(db());
    b.set(ref, {
      ...input,
      name: input.name.trim(),
      email: input.email.trim().toLowerCase(),
      phone: input.phone.trim(),
      // Conta existente vinculada = ativo; só e-mail = convidado (aceita pelo app).
      status: input.uid ? 'active' : 'invited',
      // Consentimento é do aluno (ou do responsável): nasce pendente e é registrado no aceite.
      lgpdConsentAt: null,
      makeupCredits: 0,
      createdAt: serverTimestamp(),
    });
    const audit = this.auditDoc({
      action: 'student.added',
      entity: 'student',
      entityId: ref.id,
      detail: `${input.name.trim()} ${input.uid ? 'vinculado ao centro' : 'convidado por e-mail'}${input.isMinor ? ' · menor' : ''}`,
    });
    b.set(audit.ref, audit.data);
    await b.commit();
    return ref.id;
  }

  async updateStudent(s: Student, patch: Partial<StudentInput>): Promise<void> {
    this.assertWritable();
    const b = writeBatch(db());
    b.update(this.ref('students', s.id), patch);
    const audit = this.auditDoc({ action: 'student.updated', entity: 'student', entityId: s.id, detail: `Cadastro de ${s.name} atualizado` });
    b.set(audit.ref, audit.data);
    await b.commit();
  }

  /** Consentimento do responsável legal (menor) — registrado por quem recebeu o aceite. */
  async recordGuardianConsent(s: Student, imageUseAllowed: boolean): Promise<void> {
    this.assertWritable();
    const b = writeBatch(db());
    b.update(this.ref('students', s.id), { lgpdConsentAt: serverTimestamp(), imageUseAllowed });
    const audit = this.auditDoc({
      action: 'student.consent',
      entity: 'student',
      entityId: s.id,
      detail: `Consentimento LGPD de ${s.guardian?.name || 'responsável'} registrado · uso de imagem ${imageUseAllowed ? 'autorizado' : 'não autorizado'}`,
    });
    b.set(audit.ref, audit.data);
    await b.commit();
  }

  async setStatus(s: Student, status: StudentStatus, reason: string): Promise<void> {
    this.assertWritable();
    const b = writeBatch(db());
    b.update(this.ref('students', s.id), { status });
    const audit = this.auditDoc({ action: 'student.status', entity: 'student', entityId: s.id, detail: `${s.name} → ${STATUS_LABEL[status]}`, reason });
    b.set(audit.ref, audit.data);
    await b.commit();
  }
}
