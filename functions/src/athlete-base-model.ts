/**
 * Base de atletas do backoffice: quem conta como atleta ativo e os números da base.
 *
 * Regra do dono (08/11/2026): atleta ativo é quem tem **cadastro válido** e **já entrou pelo
 * menos uma vez**. Cadastro válido segue a mesma derivação do app (`AthleteProfile.fromFirestore`
 * e `scripts/audit-recent-signups.js`); "entrou" é o `lastSignInTime` do Auth, que só existe
 * depois de um login de verdade (conta criada pelo Admin SDK e nunca usada não tem).
 *
 * Robôs das lojas (11/11/2026): a revisão e o pre-launch report da Google Play entram no app a
 * cada versão enviada e largam a conta no onboarding — cerca de 3 contas por release, todas
 * "cadastro incompleto". Ficam com a situação `review_bot` e saem de todos os números da base
 * (inclusive "Contas de atleta"), sem apagar nada.
 *
 * A marca manual de inativa (`backofficeUserFlags/{uid}.inactive`) tira a conta da contagem sem
 * apagar nada: o atleta continua entrando e usando o app normalmente.
 *
 * Funções puras: o callable (`backoffice-athlete-base.ts`) só junta Auth + Firestore e chama aqui.
 */

export const USER_FLAGS = "backofficeUserFlags";

/**
 * Precedência: desativada no Auth > robô da loja > marcada inativa > nunca entrou >
 * cadastro incompleto > ativa.
 */
export type AthleteBaseStatus =
  "active" | "incomplete" | "never_signed_in" | "inactive" | "disabled" | "review_bot";

export interface InactiveMark {
  reason: string | null;
  markedAtMs: number | null;
  markedByName: string | null;
}

export interface AthleteBaseRow {
  uid: string;
  email: string | null;
  displayName: string | null;
  fullName: string | null;
  nickname: string | null;
  photoUrl: string | null;
  roles: string[];
  disabled: boolean;
  emailVerified: boolean;
  createdAtMs: number | null;
  lastSignInMs: number | null;
  /** Última renovação do token (app ou portal abertos) — o "visto por último" mais fiel do Auth. */
  lastSeenMs: number | null;
  /** `users/{uid}` existe e o app considera o onboarding concluído. */
  profileComplete: boolean;
  /** Conta de atleta: papel `athlete` ou nenhum papel (o padrão do cadastro). */
  isAthlete: boolean;
  inactive: InactiveMark | null;
  sportCode: string | null;
  level: string | null;
  status: AthleteBaseStatus;
}

export interface MonthCount {
  /** `YYYY-MM` no fuso de São Paulo. */
  month: string;
  count: number;
}

export interface AthleteBaseSummary {
  /** Todas as contas do Auth (atletas, organizadores, equipe…). */
  accounts: number;
  /** Contas de atleta (o resto dos números conta só estas). */
  athletes: number;
  active: number;
  incomplete: number;
  neverSignedIn: number;
  inactive: number;
  disabled: number;
  /** Contas de robô das lojas (fora de `athletes` e de todos os outros números). */
  reviewBots: number;
  /** Ativos que abriram o app ou o portal nos últimos 30 dias. */
  activeSeenLast30d: number;
  /** Atletas ativos acumulados ao fim de cada um dos últimos 12 meses, pela data do cadastro. */
  activeByMonth: MonthCount[];
}

type Data = Record<string, unknown>;

const DAY_MS = 86_400_000;

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/** Mesma derivação do app para "onboarding concluído". */
export function isProfileComplete(data: Data | undefined): boolean {
  if (!data) return false;
  const onboarding = data["sportOnboarding"] as Data | undefined;
  return (
    data["isProfileComplete"] === true ||
    data["onboardingCompleted"] === true ||
    (onboarding != null && typeof onboarding === "object" && onboarding["completedAt"] != null)
  );
}

/** Domínio das contas do pre-launch report da Google Play (Firebase Test Lab). */
const TEST_LAB_DOMAIN = "@cloudtestlabaccounts.com";
/** Contas da revisão da Google Play: `nome.12345@gmail.com` (exatamente 5 dígitos). */
const PLAY_REVIEW_EMAIL = /^[a-z]+\.\d{5}@gmail\.com$/;

/**
 * Conta de robô das lojas. O padrão `nome.12345@gmail.com` só vale enquanto o cadastro está
 * incompleto: uma pessoa de verdade com esse e-mail que conclui o cadastro volta a contar.
 */
export function isReviewBot(email: string | null | undefined, profileComplete: boolean): boolean {
  const value = (email ?? "").trim().toLowerCase();
  if (!value) return false;
  if (value.endsWith(TEST_LAB_DOMAIN)) return true;
  return !profileComplete && PLAY_REVIEW_EMAIL.test(value);
}

export function isAthleteAccount(roles: readonly string[]): boolean {
  return roles.length === 0 || roles.includes("athlete");
}

/** Esporte principal e o nível declarado nele (só o único esporte, se não houver principal). */
export function primaryLevel(data: Data | undefined): {sportCode: string | null; level: string | null} {
  const onboarding = data?.["sportOnboarding"] as Data | undefined;
  const raw = onboarding?.["levelsBySport"];
  const bySport: Record<string, string> = {};
  if (raw && typeof raw === "object") {
    for (const [sport, level] of Object.entries(raw as Data)) {
      const value = str(level);
      if (value) bySport[sport] = value;
    }
  }
  const primary = str(onboarding?.["primarySportId"]) ?? "";
  const sports = Object.keys(bySport);
  const sportCode = bySport[primary] ? primary : sports.length === 1 ? sports[0]! : null;
  return {sportCode, level: sportCode ? bySport[sportCode] ?? null : null};
}

/** Mesma ordem do app: o login social só deixa `photoURL`. */
export function photoOf(data: Data | undefined): string | null {
  return str(data?.["profilePhotoUrl"]) ?? str(data?.["avatarUrl"]) ?? str(data?.["photoURL"]);
}

export function inactiveMarkOf(flags: Data | undefined, toMs: (v: unknown) => number | null): InactiveMark | null {
  if (flags?.["inactive"] !== true) return null;
  return {
    reason: str(flags["inactiveReason"]),
    markedAtMs: toMs(flags["inactiveAt"]),
    markedByName: str(flags["inactiveByName"]),
  };
}

export function statusOf(
  row: Pick<AthleteBaseRow, "disabled" | "inactive" | "lastSignInMs" | "profileComplete"> & {email?: string | null},
): AthleteBaseStatus {
  if (row.disabled) return "disabled";
  if (isReviewBot(row.email, row.profileComplete)) return "review_bot";
  if (row.inactive) return "inactive";
  if (row.lastSignInMs == null) return "never_signed_in";
  if (!row.profileComplete) return "incomplete";
  return "active";
}

/** `YYYY-MM` no fuso de São Paulo (o virar do mês é o de Brasília, não o UTC). */
export function monthKeyOf(ms: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", {timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit"})
    .formatToParts(new Date(ms));
  const year = parts.find((p) => p.type === "year")?.value ?? "0000";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  return `${year}-${month}`;
}

/** Os últimos `count` meses terminando no mês de `nowMs`, do mais antigo ao atual. */
export function lastMonths(nowMs: number, count: number): string[] {
  const [y, m] = monthKeyOf(nowMs).split("-").map(Number) as [number, number];
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const index = y * 12 + (m - 1) - i;
    out.push(`${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`);
  }
  return out;
}

export function summarizeAthleteBase(rows: readonly AthleteBaseRow[], nowMs: number): AthleteBaseSummary {
  const athletes = rows.filter((r) => r.isAthlete && r.status !== "review_bot");
  const count = (status: AthleteBaseStatus) => athletes.filter((r) => r.status === status).length;
  const active = athletes.filter((r) => r.status === "active");
  const months = lastMonths(nowMs, 12);
  const activeByMonth = months.map((month) => ({
    month,
    // Conta sem data de criação entra desde sempre: melhor que sumir do gráfico.
    count: active.filter((r) => r.createdAtMs == null || monthKeyOf(r.createdAtMs) <= month).length,
  }));
  return {
    accounts: rows.length,
    athletes: athletes.length,
    active: active.length,
    incomplete: count("incomplete"),
    neverSignedIn: count("never_signed_in"),
    inactive: count("inactive"),
    disabled: count("disabled"),
    reviewBots: rows.filter((r) => r.status === "review_bot").length,
    activeSeenLast30d: active.filter((r) => r.lastSeenMs != null && nowMs - r.lastSeenMs <= 30 * DAY_MS).length,
    activeByMonth,
  };
}

export const INACTIVE_REASON_MAX = 300;
