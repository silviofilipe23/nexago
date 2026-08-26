import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../../../lib/firebase-app';

/**
 * Registra visita na página de links ou clique num link.
 *
 * Vai pela callable `trackLinkPageEvent` porque o visitante é anônimo: as rules mantêm
 * `linkPages` como somente leitura para o cliente, e é a function que soma o contador e
 * mantém a janela diária podada. Falha de rede é ignorada de propósito — métrica nunca pode
 * atrapalhar o clique de quem está acessando a página.
 *
 * Porta 1:1 de `src/lib/track-link-event.ts` (site Next.js) — não é uma leitura do Firestore,
 * então a distinção lite/completo do SDK não se aplica aqui; a callable roda sobre HTTPS puro.
 */
export function trackLinkPageEvent(pageId: string, linkId?: string): void {
  try {
    const callable = httpsCallable(getFunctions(app), 'trackLinkPageEvent');
    void callable(linkId ? { pageId, linkId } : { pageId }).catch(() => undefined);
  } catch {
    // Ambiente sem Functions disponível — segue sem métrica.
  }
}
