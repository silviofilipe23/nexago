import {HttpsError} from "firebase-functions/v2/https";

/**
 * Recado do atleta para a arena, digitado ao confirmar a reserva ("Vamos chegar 10 min antes").
 * Gravado em `arenaBookings/{id}.athleteNotes` só na criação: as rules do dono e da equipe não
 * deixam editar depois. Mesmo limite do contador do app (`kAthleteNotesMaxLength`).
 */
export const ATHLETE_NOTES_MAX_LENGTH = 280;

// `Intl.Segmenter` existe no Node 22, mas o `target: es2017` do tsconfig não traz o tipo.
interface GraphemeSegmenter {
  segment(text: string): Iterable<unknown>;
}
type SegmenterCtor = new (locale: string, options: {granularity: "grapheme"}) => GraphemeSegmenter;
const graphemes = new (Intl as unknown as {Segmenter: SegmenterCtor}).Segmenter("pt-BR", {granularity: "grapheme"});

/** Conta como o `maxLength` do Flutter: um emoji composto é 1 caractere. */
function visibleLength(text: string): number {
  let count = 0;
  for (const _ of graphemes.segment(text)) count++;
  return count;
}

/**
 * `null` quando não há recado (app antigo, campo vazio ou só espaços). Acima do limite recusa em
 * vez de cortar: o atleta não perde o fim do recado sem saber.
 */
export function parseAthleteNotes(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw !== "string") {
    throw new HttpsError("invalid-argument", "Recado inválido.");
  }
  const text = raw.trim();
  if (text.length === 0) return null;
  if (visibleLength(text) > ATHLETE_NOTES_MAX_LENGTH) {
    throw new HttpsError(
      "invalid-argument",
      `O recado para a arena pode ter até ${ATHLETE_NOTES_MAX_LENGTH} caracteres.`,
    );
  }
  return text;
}
