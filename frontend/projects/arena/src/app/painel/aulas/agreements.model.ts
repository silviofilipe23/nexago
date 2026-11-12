/** Contratos de aulas (aluno e professor) — tipos e regras puras do portal.
 *  Os dados vêm das callables de `functions/src/arena-agreements.ts`. */

export type AgreementAudience = 'student' | 'professor';
export type AgreementStatus = 'pending' | 'signed' | 'canceled' | 'ended';

export interface AgreementRow {
  label: string;
  value: string;
}

export interface ArenaAgreement {
  agreementId: string;
  audience: AgreementAudience;
  status: AgreementStatus;
  number: string;
  title: string;
  planName: string | null;
  essentials: AgreementRow[];
  startDate: string | null;
  endDate: string | null;
  sentAt: string | null;
  signedAt: string | null;
  partyName: string;
  partyPhotoUrl: string | null;
  teacherId: string | null;
}

export interface AgreementDetail extends ArenaAgreement {
  body: string;
  sha256: string;
  templateVersion: number;
  evidence: { platform: string; appVersion: string; ip: string; readSeconds: number } | null;
}

export interface AgreementTeacher {
  teacherId: string;
  name: string;
  photoUrl: string | null;
  hasAccount: boolean;
  agreementStatus: AgreementStatus | null;
  agreementId: string | null;
}

export interface AgreementVariable {
  key: string;
  group: string;
  label: string;
}

export interface AgreementTemplate {
  audience: AgreementAudience;
  title: string;
  body: string;
  version: number;
  isDefault: boolean;
  updatedAt: string | null;
  variables: AgreementVariable[];
}

export type AudienceFilter = 'all' | AgreementAudience;

export const STATUS_LABEL: Record<AgreementStatus, string> = {
  pending: 'Aguardando',
  signed: 'Assinado',
  canceled: 'Cancelado',
  ended: 'Encerrado',
};

export const STATUS_TONE: Record<AgreementStatus, 'yellow' | 'green' | 'dim'> = {
  pending: 'yellow',
  signed: 'green',
  canceled: 'dim',
  ended: 'dim',
};

export function filterAgreements(list: readonly ArenaAgreement[], audience: AudienceFilter): ArenaAgreement[] {
  return list.filter((a) => a.status !== 'canceled' && (audience === 'all' || a.audience === audience));
}

/** Números do topo: alunos com contrato assinado, assinados pelo app no mês, professores. */
export function agreementKpis(list: readonly ArenaAgreement[], teachers: readonly AgreementTeacher[], monthKey: string) {
  const signedStudents = list.filter((a) => a.audience === 'student' && a.status === 'signed');
  return {
    studentsSigned: signedStudents.length,
    signedThisMonth: signedStudents.filter((a) => (a.signedAt ?? '').startsWith(monthKey)).length,
    teachersSigned: teachers.filter((t) => t.agreementStatus === 'signed').length,
    teachersTotal: teachers.length,
    teachersPending: teachers.filter((t) => t.agreementStatus === 'pending').length,
  };
}

/** Linha "plano · professor · dias" do contrato do aluno; planos do professor. */
export function agreementSummaryLine(a: ArenaAgreement): string {
  const pick = (label: string) => a.essentials.find((r) => r.label === label)?.value ?? '';
  if (a.audience === 'professor') return pick('Planos') || 'Contrato de professor';
  return [a.planName ?? pick('Plano'), pick('Professor'), pick('Aulas')].filter(Boolean).join(' · ');
}

/** ISO → "12/11 14:32" (fuso do navegador do gestor). */
export function shortWhen(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const two = (n: number) => String(n).padStart(2, '0');
  return `${two(d.getDate())}/${two(d.getMonth() + 1)} ${two(d.getHours())}:${two(d.getMinutes())}`;
}

/** Professores que podem receber contrato: com conta e sem contrato aguardando. */
export function teachersToSend(teachers: readonly AgreementTeacher[]): AgreementTeacher[] {
  return teachers.filter((t) => t.hasAccount);
}

/** Insere `{{chave}}` na posição do cursor. */
export function insertVariable(body: string, key: string, at: number): { body: string; cursor: number } {
  const pos = Math.max(0, Math.min(at, body.length));
  const token = `{{${key}}}`;
  return { body: body.slice(0, pos) + token + body.slice(pos), cursor: pos + token.length };
}

/** `{{chave}}` que o modelo não conhece (o servidor recusa ao publicar). */
export function unknownVariables(body: string, variables: readonly AgreementVariable[]): string[] {
  const known = new Set(variables.map((v) => v.key));
  const out = new Set<string>();
  for (const m of body.matchAll(/\{\{\s*([a-z_]+\.[a-z_]+)\s*\}\}/g)) if (!known.has(m[1]!)) out.add(m[1]!);
  return [...out];
}
