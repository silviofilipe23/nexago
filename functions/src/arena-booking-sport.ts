import {HttpsError} from "firebase-functions/v2/https";
import {resolveSport} from "./sports/catalog";

/**
 * Esporte da reserva do atleta (`arenaBookings.sport`): o atleta escolhe entre
 * os esportes da quadra para a arena saber o que vai ser jogado. Grava o
 * CÓDIGO do catálogo (`beachTennis`); "Pickleball", que ainda não está no
 * catálogo, segue como texto — mesmo vocabulário de `courts.types` (fase 5b).
 * Espelha `bookingSportOptions` de `@nexago/arena-discovery` e do app.
 */

/** Esportes de quadra fora do catálogo que o cadastro de quadra oferece. */
const OFF_CATALOG_COURT_SPORTS = ["Pickleball"];

/** Valor de quadra/escolha → código gravável. Superfície ("Areia") e vazio → null. */
export function bookingSportCode(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const code = resolveSport(raw)?.code;
  if (code) return code;
  const value = raw.trim().toLowerCase();
  return OFF_CATALOG_COURT_SPORTS.find((s) => s.toLowerCase() === value) ?? null;
}

/** Esportes da quadra (`types` → `sportTypes` → legado `type`), sem repetição. */
export function courtSportCodes(courtData: Record<string, unknown>): string[] {
  const rawTypes = courtData["types"] ?? courtData["sportTypes"];
  const values = Array.isArray(rawTypes) && rawTypes.length > 0 ?
    rawTypes :
    [courtData["type"]];
  const codes: string[] = [];
  for (const raw of values) {
    const code = bookingSportCode(raw);
    if (code && !codes.includes(code)) codes.push(code);
  }
  return codes;
}

/**
 * Esporte a gravar na reserva.
 * - Escolhido: tem de ser esporte conhecido e, se a quadra declara esportes,
 *   um deles. Quadra sem esporte cadastrado aceita qualquer esporte conhecido
 *   (o app oferece os da arena ou a lista do cadastro).
 * - Não enviado (app da loja anterior à escolha): quadra de um esporte só
 *   carimba esse; senão fica `null`.
 */
export function resolveBookingSport(
  raw: unknown,
  courtData: Record<string, unknown>,
): string | null {
  const courtCodes = courtSportCodes(courtData);
  const sent = typeof raw === "string" && raw.trim() !== "";
  if (!sent) return courtCodes.length === 1 ? courtCodes[0]! : null;

  const code = bookingSportCode(raw);
  if (!code) {
    throw new HttpsError("invalid-argument", "Esporte da reserva inválido.");
  }
  if (courtCodes.length > 0 && !courtCodes.includes(code)) {
    throw new HttpsError(
      "failed-precondition",
      "Esse esporte não é praticado nesta quadra. Escolha outro esporte.",
    );
  }
  return code;
}
