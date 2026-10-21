import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore';
import { httpsCallable, type Functions } from 'firebase/functions';
import { ArenaClassError } from './classes-repository';
import {
  classPayoutFromDoc,
  classPayoutId,
  payoutPreviewFromRaw,
  type ArenaPayoutPreview,
  type ClassPayout,
  type PayoutMethod,
} from './payout.model';

/** Repasse do professor — leitura de `arenaClassPayouts` (sempre filtrando `arenaId`; a rule
 *  exige quem lê o financeiro) e as callables de `functions/src/arena-class-payout.ts`. */

async function call<In, Out>(functions: Functions, name: string, input: In): Promise<Out> {
  try {
    return (await httpsCallable<In, Out>(functions, name)(input)).data;
  } catch (err) {
    throw new ArenaClassError(err instanceof Error && err.message ? err.message : 'Não foi possível concluir a operação.');
  }
}

export function watchMonthPayouts(db: Firestore, arenaId: string, month: string, onChange: (p: ClassPayout[]) => void, onError: () => void): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'arenaClassPayouts'), where('arenaId', '==', arenaId), where('month', '==', month)),
    (snap) => onChange(snap.docs.map(classPayoutFromDoc)),
    onError,
  );
}

/** Fechamento do professor no mês. Query, não `doc()`: a rule lê `resource.data.arenaId`, então
 *  escutar um doc que ainda não existe é negado e o listener morre antes do fechamento nascer. */
export function watchTeacherPayout(
  db: Firestore,
  arenaId: string,
  teacherId: string,
  month: string,
  onChange: (p: ClassPayout | null) => void,
): Unsubscribe {
  const id = classPayoutId(arenaId, teacherId, month);
  return onSnapshot(
    query(
      collection(db, 'arenaClassPayouts'),
      where('arenaId', '==', arenaId),
      where('teacherId', '==', teacherId),
      where('month', '==', month),
    ),
    (snap) => {
      const found = snap.docs.find((d) => d.id === id);
      onChange(found ? classPayoutFromDoc(found) : null);
    },
    () => onChange(null),
  );
}

/** Últimos fechamentos do professor (índice `arenaId, teacherId, month desc`). */
export function watchTeacherPayoutHistory(db: Firestore, arenaId: string, teacherId: string, onChange: (p: ClassPayout[]) => void): Unsubscribe {
  return onSnapshot(
    query(
      collection(db, 'arenaClassPayouts'),
      where('arenaId', '==', arenaId),
      where('teacherId', '==', teacherId),
      orderBy('month', 'desc'),
      limit(12),
    ),
    (snap) => onChange(snap.docs.map(classPayoutFromDoc)),
    () => onChange([]),
  );
}

export async function previewPayouts(functions: Functions, arenaId: string, month: string): Promise<ArenaPayoutPreview> {
  return payoutPreviewFromRaw(await call(functions, 'previewArenaClassPayouts', { arenaId, month }));
}

export function closePayout(
  functions: Functions,
  input: { arenaId: string; teacherId: string; month: string; adjustmentReais: number; adjustmentNote: string | null },
): Promise<{ payoutId: string; amountReais: number }> {
  return call(functions, 'closeArenaClassPayout', input);
}

export function setPayoutStatus(
  functions: Functions,
  payoutId: string,
  status: 'paid' | 'closed',
  paymentMethod?: PayoutMethod,
  paidOn?: string,
): Promise<{ payoutId: string; status: string }> {
  return call(functions, 'setArenaClassPayoutStatus', { payoutId, status, paymentMethod, paidOn });
}

/** Paga o repasse fechado pelo nexaGO: sai do saldo disponível do caixa da arena e entra na
 *  carteira do professor (`functions/src/professor-earnings.ts`). Não tem desfazer. */
export function payPayoutViaNexago(
  functions: Functions,
  payoutId: string,
): Promise<{ payoutId: string; status: 'paid'; paymentMethod: 'nexago'; amountReais: number }> {
  return call(functions, 'payArenaClassPayoutViaNexago', { payoutId });
}
