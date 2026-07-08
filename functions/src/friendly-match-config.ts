import type {Firestore} from "firebase-admin/firestore";

/**
 * Configuração do Bora Jogar (match finder) — doc `appConfig/friendlyMatch`.
 *
 * `enabled` é o kill-switch de rollout (o app esconde o hub quando false);
 * os demais campos parametrizam a máquina de estados. Valores inválidos no
 * doc caem no default campo a campo — nunca derrubam a função.
 */

export type FriendlyMatchConfig = {
  enabled: boolean;
  inviteExpirationHours: number;
  cancellationPenaltyWindowHours: number;
  reviewRevealHours: number;
  checkInWindow: {beforeMinutes: number; afterHours: number};
};

export const FRIENDLY_MATCH_CONFIG_PATH = "appConfig/friendlyMatch";

export const DEFAULT_FRIENDLY_MATCH_CONFIG: FriendlyMatchConfig = {
  enabled: false,
  inviteExpirationHours: 24,
  cancellationPenaltyWindowHours: 6,
  reviewRevealHours: 72,
  checkInWindow: {beforeMinutes: 30, afterHours: 24},
};

function positiveNumber(raw: unknown, fallback: number): number {
  return typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

export function parseFriendlyMatchConfig(raw: unknown): FriendlyMatchConfig {
  const data = (raw ?? {}) as Record<string, unknown>;
  const defaults = DEFAULT_FRIENDLY_MATCH_CONFIG;
  const window = (data.checkInWindow ?? {}) as Record<string, unknown>;
  return {
    enabled: typeof data.enabled === "boolean" ? data.enabled : defaults.enabled,
    inviteExpirationHours: positiveNumber(
      data.inviteExpirationHours, defaults.inviteExpirationHours),
    cancellationPenaltyWindowHours: positiveNumber(
      data.cancellationPenaltyWindowHours, defaults.cancellationPenaltyWindowHours),
    reviewRevealHours: positiveNumber(data.reviewRevealHours, defaults.reviewRevealHours),
    checkInWindow: {
      beforeMinutes: positiveNumber(
        window.beforeMinutes, defaults.checkInWindow.beforeMinutes),
      afterHours: positiveNumber(window.afterHours, defaults.checkInWindow.afterHours),
    },
  };
}

export async function loadFriendlyMatchConfig(db: Firestore): Promise<FriendlyMatchConfig> {
  const snap = await db.doc(FRIENDLY_MATCH_CONFIG_PATH).get();
  return parseFriendlyMatchConfig(snap.exists ? snap.data() : undefined);
}
