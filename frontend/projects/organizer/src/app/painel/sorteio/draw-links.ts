/**
 * Links públicos do Sorteio ao Vivo — telão e comprovante.
 *
 * Num módulo só, pelo mesmo motivo de `publicTournamentUrl`: a URL aparece no
 * botão de copiar, no "abrir telão" e no comprovante, e duas versões dela
 * significam um link quebrado circulando num grupo de WhatsApp.
 */

export function drawTelaoUrl(origin: string, sessionId: string): string {
  return `${origin.replace(/\/+$/, '')}/sorteio/${sessionId}`;
}

export function drawReceiptUrl(origin: string, sessionId: string): string {
  return `${drawTelaoUrl(origin, sessionId)}/comprovante`;
}
