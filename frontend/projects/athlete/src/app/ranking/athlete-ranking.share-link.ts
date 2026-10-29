import type { FilterFormat, FilterGender, FilterLevelBand, LevelBand, RankingMode, RankingPeriod, TeamFormat } from './athlete-ranking.models';
import { RANKING_SPORT_OPTIONS } from './athlete-ranking.selectors';

/** Recorte que chega no link "Compartilhar ranking" do app (`rankingShareLink`, em
 *  `nexago_app/lib/features/ranking/domain/ranking_share.dart`):
 *  `/ranking?esporte=VOLEI_PRAIA&modo=equipes&ano=2026&genero=feminino&nivel=open&formato=dupla&por=<uid>`.
 *  Os dois lados mudam juntos. Sem `ano` é o ranking geral; sem os recortes, "Todos". */
export interface SharedRankingSlice {
  /** `null`: esporte fora da lista do portal — fica o padrão do atleta. */
  sport: string | null;
  mode: RankingMode;
  period: RankingPeriod;
  /** Temporada do link; `null` no geral. */
  year: number | null;
  gender: FilterGender;
  level: FilterLevelBand;
  format: FilterFormat;
  /** uid de quem compartilhou (o "Fulano compartilhou" do aviso). */
  sharedBy: string | null;
}

/** O que o `ParamMap` do Angular oferece — e o `URLSearchParams`, nos testes. */
export interface QueryParamsLike {
  get(name: string): string | null;
}

const GENDERS: Readonly<Record<string, FilterGender>> = { masculino: 'male', feminino: 'female', misto: 'mixed' };
const LEVELS: readonly LevelBand[] = ['iniciante', 'intermediario', 'avancado', 'open'];
const FORMATS: readonly TeamFormat[] = ['dupla', 'trio', 'quarteto', 'quinteto'];

function clean(raw: string | null): string {
  return (raw ?? '').trim().toLowerCase();
}

/** Lê o recorte do link; `null` quando a URL não é um compartilhamento (abrir `/ranking` pelo menu
 *  não pode sobrescrever nada). Valor desconhecido cai em "Todos" em vez de esvaziar a lista. */
export function sharedRankingFromQuery(params: QueryParamsLike): SharedRankingSlice | null {
  const modeRaw = clean(params.get('modo'));
  const sportRaw = (params.get('esporte') ?? '').trim();
  if (modeRaw.length === 0 && sportRaw.length === 0) return null;

  // O app chama a aba de "Equipes"; o portal, de "Duplas". Os dois querem dizer a lista de times.
  const mode: RankingMode = modeRaw === 'equipes' || modeRaw === 'duplas' ? 'doubles' : 'individual';
  const yearNum = Number.parseInt(clean(params.get('ano')), 10);
  const year = Number.isInteger(yearNum) && yearNum >= 2000 && yearNum <= 2100 ? yearNum : null;
  const level = clean(params.get('nivel'));
  const format = clean(params.get('formato'));
  const sharedBy = (params.get('por') ?? '').trim();

  return {
    sport: RANKING_SPORT_OPTIONS.some((o) => o.code === sportRaw) ? sportRaw : null,
    mode,
    period: year == null ? 'geral' : 'temporada',
    year,
    gender: GENDERS[clean(params.get('genero'))] ?? 'all',
    level: (LEVELS as readonly string[]).includes(level) ? (level as LevelBand) : 'all',
    // Formato só existe na lista de times — no Individual esvaziaria a lista sem controle à vista.
    format: mode === 'doubles' && (FORMATS as readonly string[]).includes(format) ? (format as TeamFormat) : 'all',
    sharedBy: sharedBy.length > 0 ? sharedBy : null,
  };
}

/** "Ray" de "Ray" (apelido) ou de "Raissa Lima" (nome completo): o aviso é curto. */
export function sharerFirstName(profile: { nickname: string | null; displayName: string } | undefined): string | null {
  if (!profile) return null;
  const nickname = profile.nickname?.trim();
  if (nickname) return nickname;
  const first = profile.displayName.trim().split(/\s+/)[0] ?? '';
  // `displayName` sem nome vira "Atleta (…abc123)" — melhor o aviso genérico.
  return first.length > 0 && first !== 'Atleta' ? first : null;
}
