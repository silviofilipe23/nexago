import type { ArenaListItem } from './arena-list-item';

/**
 * Contato com arena pré-cadastrada (`unclaimed`).
 *
 * A mensagem é o produto da feature: a arena precisa entender, na primeira
 * linha, que aquele contato veio da nexaGO. É o que transforma o clique em
 * argumento de venda depois ("esses atletas chegaram até você pela plataforma").
 *
 * Paridade textual com `arena_contact_message.dart` (Flutter) — se mudar a
 * frase aqui, mude lá também.
 */
export function buildArenaContactWhatsAppMessage(arenaName: string): string {
  const name = arenaName.trim();
  const target = name.length > 0 ? name : 'a arena';
  return (
    'Olá! Cheguei até vocês pela nexaGO. ' +
    `Vi ${target} no app e queria saber sobre horários e valores para jogar.`
  );
}

/** Paridade com `_normalizeWhatsAppDigits` (Flutter). */
function normalizeWhatsAppDigits(raw: string | null | undefined): string | null {
  if (!raw) {
    return null;
  }
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 0) {
    return null;
  }
  if (digits.length >= 12 && digits.startsWith('55')) {
    return digits;
  }
  if (digits.length >= 10 && digits.length <= 11) {
    return `55${digits}`;
  }
  if (digits.length >= 12) {
    return digits;
  }
  return null;
}

/**
 * URL `wa.me` já com a mensagem, ou `null` quando a arena não tem número
 * utilizável — nesse caso o botão de contato não deve ser exibido.
 */
export function arenaContactWhatsAppUrl(arena: ArenaListItem): string | null {
  const digits = normalizeWhatsAppDigits(arena.whatsapp ?? arena.phone);
  if (!digits) {
    return null;
  }
  const text = encodeURIComponent(buildArenaContactWhatsAppMessage(arena.name));
  return `https://wa.me/${digits}?text=${text}`;
}
