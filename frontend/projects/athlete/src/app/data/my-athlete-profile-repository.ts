import { doc, getDoc, type Firestore } from 'firebase/firestore';

/** Perfil PRÓPRIO (`users/{uid}`) — só os campos que a inscrição precisa: gênero/nascimento
 *  (elegibilidade) e nome/apelido (nome default na camisa). `public_profiles` não serve aqui:
 *  é o espelho sem PII (nunca tem gênero/nascimento). O doc do próprio usuário é legível pelo
 *  client — o `onboarding.guard` já depende disso. */
export interface MyAthleteProfile {
  gender: string | null;
  /** Cru do doc (ISO `aaaa-mm-dd` ou BR `dd/mm/aaaa`) — parse fica em `tournament-eligibility`. */
  birthDate: string | null;
  /** Nível global legado — fallback quando não há nível pro esporte do torneio. */
  level: string | null;
  /** `sportOnboarding.levelsBySport` (código do esporte → código do nível). */
  levelsBySport: Record<string, string>;
  /** `sportOnboarding.levelLocked` — janela de correção (plano de calibração
   *  de nível): `true` só depois da 1ª inscrição ativa naquele esporte,
   *  gravado pelo backend (`functions/src/tournament-level-lock.ts`). Esporte
   *  ausente do mapa == destravado. */
  levelLocked: Record<string, boolean>;
  fullName: string | null;
  nickname: string | null;
  /** Foto enviada no onboarding (`profilePhotoUrl`) — null quando o atleta não enviou uma. */
  profilePhotoUrl: string | null;
}

function optionalStr(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

export async function fetchMyAthleteProfile(db: Firestore, uid: string): Promise<MyAthleteProfile | null> {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return null;
  const data = snap.data() as Record<string, unknown>;
  const sportOnboarding = data['sportOnboarding'] as Record<string, unknown> | undefined;
  const levelsRaw = sportOnboarding?.['levelsBySport'] as Record<string, unknown> | undefined;
  const levelsBySport: Record<string, string> = {};
  for (const [sport, level] of Object.entries(levelsRaw ?? {})) {
    const value = optionalStr(level);
    if (value) levelsBySport[sport] = value;
  }
  const lockedRaw = sportOnboarding?.['levelLocked'] as Record<string, unknown> | undefined;
  const levelLocked: Record<string, boolean> = {};
  for (const [sport, locked] of Object.entries(lockedRaw ?? {})) {
    if (locked === true) levelLocked[sport] = true;
  }
  return {
    gender: optionalStr(data['gender']),
    birthDate: optionalStr(data['birthDate']),
    level: optionalStr(data['level']) ?? optionalStr(data['nivel']),
    levelsBySport,
    levelLocked,
    fullName: optionalStr(data['fullName']) ?? optionalStr(data['name']),
    nickname: optionalStr(data['nickname']),
    profilePhotoUrl: optionalStr(data['profilePhotoUrl']),
  };
}
