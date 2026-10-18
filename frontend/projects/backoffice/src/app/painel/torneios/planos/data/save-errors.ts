import { callableErrorMessage } from '../../../data/callable-error';

/** `not-found` cru ("NOT FOUND") é callable que ainda não foi publicada, não registro sumido. */
export function saveErrorText(error: unknown): string {
  const code = String((error as { code?: unknown })?.code ?? '');
  const message = String((error as { message?: unknown })?.message ?? '');
  if (code.includes('not-found')) {
    return message && message !== 'NOT FOUND' ? message : 'Função ainda não publicada no servidor.';
  }
  return callableErrorMessage(error);
}

/** Outra pessoa gravou antes: a tela oferece "Recarregar". */
export function isVersionConflict(error: unknown): boolean {
  return String((error as { code?: unknown })?.code ?? '').includes('failed-precondition');
}
