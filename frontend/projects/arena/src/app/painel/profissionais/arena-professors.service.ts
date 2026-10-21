import { Injectable } from '@angular/core';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { searchAthletes, type AthleteSearchResult } from '../clubinho/clubs-repository';
import { arenaFirestore } from '../data/firestore';
import { arenaFunctions } from '../data/functions';
import {
  arenaProfessorEventFromDoc,
  arenaProfessorLinkFromDoc,
  callableErrorMessage,
  sortEventsDesc,
  type ArenaProfessorEvent,
  type ArenaProfessorLink,
  type ProfessorLinkStatus,
  type ProfessorLinkType,
  type ProfessorPermissions,
} from './arena-professor.model';

export class ArenaProfessorError extends Error {
  constructor(
    message: string,
    readonly code: string | null,
    readonly details: unknown,
  ) {
    super(message);
  }
}

export interface ProfessorLinkResult {
  linkId: string;
  status: ProfessorLinkStatus;
}

export interface ProfessorInviteInput {
  arenaId: string;
  professorUserId: string;
  relationshipType: ProfessorLinkType;
  permissions: ProfessorPermissions;
  message: string | null;
}

const FALLBACK_ERROR = 'Não foi possível concluir a operação. Tente novamente.';

async function call<In>(name: string, input: In): Promise<ProfessorLinkResult> {
  try {
    const result = await httpsCallable<In, ProfessorLinkResult>(arenaFunctions(), name)(input);
    return result.data;
  } catch (err) {
    const code = (err as { code?: unknown })?.code;
    throw new ArenaProfessorError(
      callableErrorMessage(err, FALLBACK_ERROR),
      typeof code === 'string' ? code.replace(/^functions\//, '') : null,
      (err as { details?: unknown })?.details ?? null,
    );
  }
}

/** Fonte única de dados e ações da tela Profissionais (A1–A6). Leitura direta do Firestore —
 *  a rule libera dono/gestor pela área `perfil` e confere `arenaId`, por isso toda query filtra
 *  a arena. Escrita só pelos callables (`functions/src/arena-professor-links.ts`): transição,
 *  unicidade do par e histórico vivem no servidor.
 *
 *  As telas só falam com esta classe — uma rota de QA pode trocá-la por um fake
 *  (`{ provide: ArenaProfessorsService, useValue: fake }`) sem login nem Firebase. */
@Injectable({ providedIn: 'root' })
export class ArenaProfessorsService {
  /** Vínculos da arena, ao vivo. Erro de leitura (rule, rede) chega em `onError`. */
  watchLinks(
    arenaId: string,
    onChange: (links: ArenaProfessorLink[]) => void,
    onError: (message: string) => void,
  ): () => void {
    return onSnapshot(
      query(collection(arenaFirestore(), 'arenaProfessors'), where('arenaId', '==', arenaId)),
      (snap) => onChange(snap.docs.map(arenaProfessorLinkFromDoc)),
      () => onError('Não foi possível carregar os professores. Recarregue a página.'),
    );
  }

  /** Um vínculo, ao vivo; `null` quando não existe ou a leitura é negada. */
  watchLink(linkId: string, onChange: (link: ArenaProfessorLink | null) => void): () => void {
    return onSnapshot(
      doc(arenaFirestore(), 'arenaProfessors', linkId),
      (snap) => onChange(snap.exists() ? arenaProfessorLinkFromDoc(snap) : null),
      () => onChange(null),
    );
  }

  /** Histórico imutável do vínculo, mais recente primeiro. */
  watchEvents(linkId: string, onChange: (events: ArenaProfessorEvent[]) => void): () => void {
    return onSnapshot(
      collection(arenaFirestore(), 'arenaProfessors', linkId, 'events'),
      (snap) =>
        onChange(
          sortEventsDesc(snap.docs.map(arenaProfessorEventFromDoc).filter((e): e is ArenaProfessorEvent => e != null)),
        ),
      () => onChange([]),
    );
  }

  /** Contas NexaGO pelo perfil público (mesma busca de Aulas/Clubinho). */
  searchAccounts(term: string): Promise<AthleteSearchResult[]> {
    return searchAthletes(arenaFirestore(), term);
  }

  invite(input: ProfessorInviteInput): Promise<ProfessorLinkResult> {
    return call('createArenaProfessorInvite', {
      arenaId: input.arenaId,
      professorUserId: input.professorUserId,
      relationshipType: input.relationshipType,
      permissions: input.permissions,
      message: input.message ?? undefined,
    });
  }

  approve(linkId: string, permissions: ProfessorPermissions): Promise<ProfessorLinkResult> {
    return call('approveArenaProfessorRequest', { linkId, permissions });
  }

  reject(linkId: string, reason: string | null): Promise<ProfessorLinkResult> {
    return call('rejectArenaProfessorRequest', { linkId, reason: reason ?? undefined });
  }

  suspend(linkId: string, reason: string, details: string | null): Promise<ProfessorLinkResult> {
    return call('suspendArenaProfessorLink', { linkId, reason, details: details ?? undefined });
  }

  reactivate(linkId: string): Promise<ProfessorLinkResult> {
    return call('reactivateArenaProfessorLink', { linkId });
  }

  end(linkId: string, reason: string | null): Promise<ProfessorLinkResult> {
    return call('endArenaProfessorLink', { linkId, side: 'ARENA', reason: reason ?? undefined });
  }

  cancelInvite(linkId: string): Promise<ProfessorLinkResult> {
    return call('cancelArenaProfessorLink', { linkId, side: 'ARENA' });
  }

  /** Patch parcial: só as chaves enviadas mudam no servidor. */
  updatePermissions(linkId: string, permissions: Partial<ProfessorPermissions>): Promise<ProfessorLinkResult> {
    return call('updateArenaProfessorPermissions', { linkId, permissions });
  }

  /** % inteiro de 0 a 90 (0 = sem desconto); vale na reserva "como professor". */
  updateCourtDiscount(linkId: string, courtDiscountPercent: number): Promise<ProfessorLinkResult> {
    return call('updateArenaProfessorCourtDiscount', { linkId, courtDiscountPercent });
  }
}
