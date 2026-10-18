import { InjectionToken } from '@angular/core';
import { httpsCallable } from 'firebase/functions';
import { environment } from '../../../environments/environment';
import { athleteFunctions } from '../../data/functions';
import type { ApplicationAnswers } from './squad-view';

/**
 * As duas portas do Squad no portal: a leitura saneada (`getMySquadView`) e a candidatura
 * (`submitSquadApplication`, já existente). O atleta não lê nenhuma coleção do Squad direto —
 * comissões e contrato guardam campos internos do time.
 *
 * Interface para as telas serem testadas sem Firebase (o token devolve `null` sem chave).
 */
export interface SquadApi {
  fetchView(): Promise<unknown>;
  submitApplication(answers: ApplicationAnswers): Promise<void>;
}

export function firebaseSquadApi(): SquadApi {
  const fns = athleteFunctions();
  return {
    fetchView: async () => (await httpsCallable(fns, 'getMySquadView')({})).data,
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
