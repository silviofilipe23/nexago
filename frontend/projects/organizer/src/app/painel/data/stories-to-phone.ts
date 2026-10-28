import { getAuth } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { ref, uploadBytes } from 'firebase/storage';
import { organizerFunctions } from './functions';
import { organizerStorage } from './storage';

export interface StoriesToPhoneRequest {
  tournamentId: string;
  categoryName: string;
  /** "duplas", "equipes"… — o que a arte lista. */
  unitLabel: string;
  /** Link de inscrição para a figurinha do Instagram; `null` com inscrições fechadas. */
  link: string | null;
  /** As artes na ordem dos stories. */
  files: readonly File[];
}

export interface StoriesToPhoneResult {
  shareId: string;
  pageCount: number;
  /** Aparelhos com o app que receberam o push. 0 = nenhum celular conectado a esta conta. */
  devices: number;
}

function newShareId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * "Enviar para o celular": sobe as artes em `storyShares/{uid}/{tournamentId}/{shareId}/{n}.png`
 * (regra em storage.rules) e chama `sendStoriesToPhone`, que grava o envio e manda o push para o
 * app do próprio organizador — o app baixa e abre a folha de compartilhar com o Instagram.
 */
export async function sendStoriesToPhone(req: StoriesToPhoneRequest): Promise<StoriesToPhoneResult> {
  const storage = organizerStorage();
  const uid = getAuth(storage.app).currentUser?.uid;
  if (!uid) throw new Error('Sessão expirada.');

  const shareId = newShareId();
  await Promise.all(
    req.files.map((file, i) =>
      uploadBytes(
        ref(storage, `storyShares/${uid}/${req.tournamentId}/${shareId}/${i + 1}.png`),
        file,
        { contentType: 'image/png' },
      ),
    ),
  );

  const send = httpsCallable<Record<string, unknown>, StoriesToPhoneResult>(
    organizerFunctions(),
    'sendStoriesToPhone',
  );
  const { data } = await send({
    tournamentId: req.tournamentId,
    shareId,
    pageCount: req.files.length,
    categoryName: req.categoryName,
    unitLabel: req.unitLabel,
    link: req.link,
  });
  return data;
}
