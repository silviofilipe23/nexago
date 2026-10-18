import { InjectionToken } from '@angular/core';
import { httpsCallable } from 'firebase/functions';
import { environment } from '../../../environments/environment';
import { athleteFunctions } from '../../data/functions';
import type { ApplicationAnswers } from './squad-view';

/**
 * As portas do Squad no portal: `getMySquad` e `getSquadRanking` (a visão do embaixador que o app
 * também usa), `getSquadPortalInfo` (só do portal) e a candidatura (`submitSquadApplication`). O
 * atleta não lê nenhuma coleção do Squad direto — comissões e contrato guardam campos internos.
 *
 * Interface para as telas serem testadas sem Firebase (o token devolve `null` sem chave).
 */
export interface SquadApi {
  fetchMySquad(): Promise<unknown>;
  /** Só embaixador com contrato vivo: os outros recebem `permission-denied`. */
  fetchRanking(): Promise<unknown>;
  fetchPortalInfo(): Promise<unknown>;
  submitApplication(answers: ApplicationAnswers): Promise<void>;
}

export function firebaseSquadApi(): SquadApi {
  const fns = athleteFunctions();
  const read = async (name: string) => (await httpsCallable(fns, name)({})).data;
  return {
    fetchMySquad: () => read('getMySquad'),
    fetchRanking: () => read('getSquadRanking'),
    fetchPortalInfo: () => read('getSquadPortalInfo'),
    submitApplication: async (answers) => {
      await httpsCallable(fns, 'submitSquadApplication')({ source: 'portal', answers });
    },
  };
}

export const SQUAD_API = new InjectionToken<SquadApi | null>('SQUAD_API', {
  providedIn: 'root',
  factory: () => (environment.firebase.apiKey ? firebaseSquadApi() : null),
});

/** Mensagem do `HttpsError` (o servidor manda pronta em português) ou a genérica. */
export function squadErrorMessage(e: unknown, fallback: string): string {
  const err = e as { code?: unknown; message?: unknown } | null;
  const code = typeof err?.code === 'string' ? err.code.replace(/^functions\//, '') : '';
  const raw = typeof err?.message === 'string' ? err.message : '';
  const detail = raw.replace(/^Firebase:\s*/i, '').replace(/\s*\(functions\/[^)]+\)\.?\s*$/i, '').trim();
  switch (code) {
    case 'unauthenticated':
      return 'Sua sessão expirou. Entre de novo para continuar.';
    // Callable ainda não publicada: o SDK devolve "not-found" cru, que não diz nada ao atleta.
    case 'not-found':
      return 'O Squad ainda não está disponível por aqui. Tente de novo mais tarde.';
    case 'invalid-argument':
    case 'failed-precondition':
    case 'already-exists':
    case 'permission-denied':
      return detail || fallback;
    default:
      return fallback;
  }
}
