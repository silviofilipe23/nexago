/**
 * NexaSquad: foto do embaixador nos avatares do backoffice.
 *
 * Vem do espelho público `squadPublic/{uid}` (leitura aberta), que já tira a foto de quem tem
 * perfil privado. Uma leitura por sessão, sob demanda: o primeiro avatar que aparece pede. Sem
 * foto, URL estranha ou falha de rede, o avatar segue com as iniciais.
 */
import { Injectable, InjectionToken, inject, signal } from '@angular/core';
import { collection, getDocs } from 'firebase/firestore';
import { backofficeDb } from '../../data/firebase';

/** Só https: o espelho é público e outra origem não entra no `src`. */
export function safePhotoUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const url = raw.trim();
  return /^https:\/\/\S+$/i.test(url) ? url : null;
}

/** Docs do espelho → `uid → foto`, só de quem tem foto válida. */
export function photoMapFromDocs(docs: ReadonlyArray<{ id: string; data: Record<string, unknown> }>): ReadonlyMap<string, string> {
  const out = new Map<string, string>();
  for (const d of docs) {
    const url = safePhotoUrl(d.data['photoUrl']);
    if (url) out.set(d.id, url);
  }
  return out;
}

/** Como ler o espelho; os specs trocam por um mapa fixo. */
export const SQUAD_PHOTOS_LOADER = new InjectionToken<() => Promise<ReadonlyMap<string, string>>>('SQUAD_PHOTOS_LOADER', {
  providedIn: 'root',
  factory: () => async () => {
    const snap = await getDocs(collection(backofficeDb(), 'squadPublic'));
    return photoMapFromDocs(snap.docs.map((d) => ({ id: d.id, data: d.data() })));
  },
});

@Injectable({ providedIn: 'root' })
export class SquadPhotosStore {
  private readonly loader = inject(SQUAD_PHOTOS_LOADER);
  private readonly photos = signal<ReadonlyMap<string, string>>(new Map());
  private requested = false;

  /** Pede o espelho uma vez; chamadas seguintes não fazem nada. */
  load(): void {
    if (this.requested) return;
    this.requested = true;
    this.loader()
      .then((map) => this.photos.set(map))
      .catch(() => {
        // Sem a foto o avatar fica com as iniciais; não vale travar a tela por isso.
      });
  }

  photoOf(uid: string): string | null {
    return this.photos().get(uid) ?? null;
  }
}
