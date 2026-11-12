import { httpsCallable, type Functions } from 'firebase/functions';
import type {
  AgreementAudience,
  AgreementDetail,
  AgreementRow,
  AgreementTeacher,
  AgreementTemplate,
  ArenaAgreement,
} from './agreements.model';
import { ArenaClassError } from './classes-repository';

/** Contratos de aulas — tudo por callable (`arenaAgreements` é fechado nas rules). */
async function call<In, Out>(functions: Functions, name: string, input: In): Promise<Out> {
  try {
    return (await httpsCallable<In, Out>(functions, name)(input)).data;
  } catch (err) {
    throw new ArenaClassError(err instanceof Error && err.message ? err.message : 'Não foi possível concluir a operação.');
  }
}

export function fetchAgreements(
  functions: Functions,
  arenaId: string,
): Promise<{ agreements: ArenaAgreement[]; teachers: AgreementTeacher[] }> {
  return call(functions, 'listArenaAgreements', { arenaId });
}

export function fetchAgreement(functions: Functions, agreementId: string): Promise<AgreementDetail> {
  return call(functions, 'getArenaAgreement', { agreementId });
}

export function fetchTemplates(
  functions: Functions,
  arenaId: string,
): Promise<Record<AgreementAudience, AgreementTemplate>> {
  return call(functions, 'getArenaAgreementTemplates', { arenaId });
}

export function saveTemplate(
  functions: Functions,
  input: { arenaId: string; audience: AgreementAudience; title: string; body: string },
): Promise<{ audience: AgreementAudience; version: number }> {
  return call(functions, 'saveArenaAgreementTemplate', input);
}

export function previewProfessorAgreement(
  functions: Functions,
  arenaId: string,
  teacherId: string,
): Promise<{ title: string; body: string; essentials: AgreementRow[]; templateVersion: number }> {
  return call(functions, 'previewArenaProfessorAgreement', { arenaId, teacherId });
}

export function sendProfessorAgreement(
  functions: Functions,
  arenaId: string,
  teacherId: string,
): Promise<{ agreementId: string }> {
  return call(functions, 'sendArenaProfessorAgreement', { arenaId, teacherId });
}

export function cancelAgreement(functions: Functions, agreementId: string): Promise<{ status: string }> {
  return call(functions, 'cancelArenaAgreement', { agreementId });
}
