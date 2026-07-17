import { doc, onSnapshot, type Firestore, type Unsubscribe } from 'firebase/firestore';

/** Catálogo das missões diárias — porta 1:1 de `daily_mission_catalog.dart` (Flutter) e
 *  `DAILY_MISSION_CATALOG` (functions/src/daily-mission-gamification.ts). O catálogo é código
 *  (não config); o ESTADO do dia vive em `users/{uid}/gamification_daily_missions/{dayKey}`
 *  (mapa `missions: {ID: true}`), escrito só por Cloud Functions. */
export interface DailyMissionDefinition {
  id: string;
  title: string;
  subtitle: string;
  xpReward: number;
}

export const DAILY_MISSION_CATALOG: readonly DailyMissionDefinition[] = [
  { id: 'PLAY_TODAY', title: 'Jogue 1x hoje', subtitle: 'Bata bola em qualquer arena.', xpReward: 40 },
  { id: 'RESERVE_TODAY', title: 'Reserve uma quadra hoje', subtitle: 'Confirme um horário para jogar hoje.', xpReward: 35 },
  { id: 'FAVORITE_ARENA', title: 'Favorite uma arena', subtitle: 'Salve uma arena para achar rápido depois.', xpReward: 15 },
  { id: 'EXPLORE_TOURNAMENT', title: 'Explore um torneio', subtitle: 'Veja detalhes de um torneio ou liga.', xpReward: 20 },
  { id: 'SHARE_PROFILE', title: 'Compartilhe seu perfil', subtitle: 'Mostre seu perfil para amigos.', xpReward: 20 },
];

/** `YYYY-MM-DD` local — mesmo formato do backend (`dayKey()` em daily-mission-gamification.ts). */
export function dailyMissionDayKey(date = new Date()): string {
  const y = String(date.getFullYear()).padStart(4, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** IDs concluídos hoje — doc pode não existir (nenhuma missão feita ainda). */
export function watchDailyMissions(
  db: Firestore,
  uid: string,
  onChange: (doneIds: ReadonlySet<string>) => void,
  onError?: () => void,
): Unsubscribe {
  const ref = doc(db, 'users', uid, 'gamification_daily_missions', dailyMissionDayKey());
  return onSnapshot(
    ref,
    (snapshot) => {
      const missions = (snapshot.data()?.['missions'] ?? {}) as Record<string, unknown>;
      onChange(new Set(Object.keys(missions).filter((k) => missions[k] === true)));
    },
    () => onError?.(),
  );
}
