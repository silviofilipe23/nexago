/**
 * Chave PIX de repasse da PESSOA — `organizerPayoutProfiles/{uid}`.
 *
 * Com o caixa morando no torneio e cada um sacando para a própria conta
 * (decisão do dono, 16/09/2026), a chave deixou de ser um dado da carteira e
 * passou a ser um dado de quem saca. Escrita só por Cloud Function; as rules
 * liberam leitura ao próprio dono.
 */
import {FieldValue, type Firestore} from "firebase-admin/firestore";

const ORGANIZER_PAYOUT_PROFILES = "organizerPayoutProfiles";

export function organizerPayoutProfileRef(db: Firestore, uid: string) {
  return db.collection(ORGANIZER_PAYOUT_PROFILES).doc(uid);
}

export async function savePayoutPixKey(
  db: Firestore,
  uid: string,
  params: {pixKey: string; pixKeyType: string},
): Promise<void> {
  await organizerPayoutProfileRef(db, uid).set(
    {
      payoutPixKey: params.pixKey,
      payoutPixKeyType: params.pixKeyType,
      updatedAt: FieldValue.serverTimestamp(),
    },
    {merge: true},
  );
}

/**
 * Chave de repasse de `uid`. Cai na carteira antiga quando o perfil não existe:
 * quem já tinha chave cadastrada em `organizerWallets/{uid}` não precisa
 * cadastrar de novo, e a migração copia o dado de qualquer forma.
 */
export async function loadPayoutPixKey(
  db: Firestore,
  uid: string,
): Promise<{pixKey: string; pixKeyType: string}> {
  const profile = await organizerPayoutProfileRef(db, uid).get();
  const fromProfile = (profile.data()?.payoutPixKey as string | undefined)?.trim() ?? "";
  if (fromProfile) {
    return {
      pixKey: fromProfile,
      pixKeyType: (profile.data()?.payoutPixKeyType as string | undefined)?.trim() ?? "",
    };
  }
  const legacy = await db.collection("organizerWallets").doc(uid).get();
  return {
    pixKey: (legacy.data()?.payoutPixKey as string | undefined)?.trim() ?? "",
    pixKeyType: (legacy.data()?.payoutPixKeyType as string | undefined)?.trim() ?? "",
  };
}
