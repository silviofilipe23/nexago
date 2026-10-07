import { collection, getDocs } from 'firebase/firestore';
import { organizerFirestore } from './firestore';

/** Prêmio como o doc grava: `valueCents` (novo) ou `value` em reais, number ou string ("2000",
 *  "R$ 2.000,00"). Quem soma decide qual vale (`eventosCardOf`). */
export interface UpcomingEventPrize {
  valueCents: number | null;
  value: string | null;
}

export interface UpcomingEventCategory {
  name: string;
  maxTeams: number | null;
}

/** Resumo de um torneio público futuro — só o que a tela "Próximos eventos" precisa. */
export interface UpcomingEventSummary {
  id: string;
  name: string;
  startAt: Date;
  endAt: Date | null;
  venue: string | null;
  city: string | null;
  /** UF. */
  state: string | null;
  coverUrl: string | null;
  categories: UpcomingEventCategory[];
  capacity: number;
  /** Prêmios da raiz do doc e os das categorias (juntos, em lista própria). */
  prizes: UpcomingEventPrize[];
  categoryPrizes: UpcomingEventPrize[];
  cashPrizesEnabled: boolean | null;
  visibility: string | null;
  /** `listingStatus ?? status`, como veio no doc. */
  status: string | null;
  registrationOpensAt: Date | null;
  registrationClosesAt: Date | null;
}

const COVER_KEYS = ['coverUrl', 'imageUrl', 'coverImageUrl', 'posterUrl', 'thumbnailUrl'];
const EXCLUDED_STATUS = ['draft', 'cancelled', 'canceled', 'completed'];

type Raw = Record<string, unknown>;

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}
function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
function date(v: unknown): Date | null {
  const t = v as { toDate?: () => Date } | undefined;
  if (typeof t?.toDate === 'function') return t.toDate();
  if (typeof v === 'string') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}
function rec(v: unknown): Raw | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Raw) : null;
}

function prizesOf(list: unknown): UpcomingEventPrize[] {
  if (!Array.isArray(list)) return [];
  return list.flatMap((item) => {
    const p = rec(item);
    if (!p) return [];
    const raw = p['value'];
    return [{ valueCents: num(p['valueCents']), value: typeof raw === 'number' ? String(raw) : str(raw) }];
  });
}

/** Parser leve do doc cru (o do painel não lê UF, prêmios nem janela de inscrição). `null` = doc
 *  sem nome ou sem data de início. */
export function upcomingEventFromDoc(id: string, data: Raw): UpcomingEventSummary | null {
  const name = str(data['name']);
  const startAt = date(data['startAt']) ?? date(data['firstMatchAt']);
  if (!name || !startAt) return null;
  let coverUrl: string | null = null;
  for (const key of COVER_KEYS) {
    coverUrl = str(data[key]);
    if (coverUrl) break;
  }
  const rawCategories = (Array.isArray(data['categories']) ? data['categories'] : []).map(rec).filter((c): c is Raw => c !== null);
  const categories = rawCategories.flatMap((c) => {
    const catName = str(c['categoryName']) ?? str(c['name']);
    return catName ? [{ name: catName, maxTeams: num(c['maxTeams']) ?? num(c['spotsTotal']) }] : [];
  });
  return {
    id,
    name,
    startAt,
    endAt: date(data['endAt']),
    venue: str(data['locationName']) ?? str(data['location']),
    city: str(data['city']),
    state: str(data['state']),
    coverUrl,
    categories,
    capacity: num(data['capacity']) ?? 0,
    prizes: prizesOf(data['prizes']),
    categoryPrizes: rawCategories.flatMap((c) => prizesOf(c['prizes'])),
    cashPrizesEnabled: typeof data['cashPrizesEnabled'] === 'boolean' ? data['cashPrizesEnabled'] : null,
    visibility: str(data['visibility']),
    status: str(data['listingStatus']) ?? str(data['status']),
    registrationOpensAt: date(data['registrationOpensAt']),
    registrationClosesAt: date(data['registrationClosesAt']),
  };
}

/** Mesma regra de quem aparece no site: listagem pública (estrito), não rascunho/cancelado/
 *  concluído e ainda por acontecer (`endAt ?? startAt` no futuro). Ordenado por início. */
export function upcomingPublicEvents(events: readonly UpcomingEventSummary[], now: Date): UpcomingEventSummary[] {
  return events
    .filter((e) => e.visibility === 'publicListing')
    .filter((e) => !EXCLUDED_STATUS.includes(e.status ?? ''))
    .filter((e) => (e.endAt ?? e.startAt).getTime() >= now.getTime())
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
}

/** Lê a coleção inteira (leitura pública) e filtra em memória — sem índice composto novo. */
export async function fetchUpcomingPublicEvents(now: Date = new Date()): Promise<UpcomingEventSummary[]> {
  const snap = await getDocs(collection(organizerFirestore(), 'tournaments'));
  const all = snap.docs.flatMap((d) => {
    const e = upcomingEventFromDoc(d.id, d.data() as Raw);
    return e ? [e] : [];
  });
  return upcomingPublicEvents(all, now);
}
