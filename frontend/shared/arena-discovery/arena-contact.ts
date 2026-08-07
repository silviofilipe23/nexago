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

/**
 * WhatsApp comercial da nexaGO, em E.164 (ex.: `5562999999999`).
 *
 * ÚNICO lugar a preencher: é daqui que sai o botão "Gostaria de ver sua arena
 * aqui?" nas duas superfícies web. Enquanto estiver vazio o botão cai no e-mail
 * comercial — nunca gera um `wa.me` quebrado.
 */
export const NEXAGO_SALES_WHATSAPP = '';

/** Canal de vendas já usado na tela de planos do portal da arena. */
export const NEXAGO_SALES_EMAIL = 'contato@nexago.com.br';

const SALES_SUBJECT = 'Quero cadastrar minha arena na nexaGO';
const SALES_MESSAGE =
  'Olá! Tenho uma arena e gostaria de cadastrá-la na nexaGO para aparecer para os atletas.';

/**
 * Destino do "Gostaria de ver sua arena aqui?": WhatsApp comercial quando
 * configurado, e-mail de vendas caso contrário.
 */
export function nexagoArenaSignupContactUrl(): string {
  const digits = normalizeWhatsAppDigits(NEXAGO_SALES_WHATSAPP);
  if (digits) {
    return `https://wa.me/${digits}?text=${encodeURIComponent(SALES_MESSAGE)}`;
  }
  return `mailto:${NEXAGO_SALES_EMAIL}?subject=${encodeURIComponent(
    SALES_SUBJECT,
  )}&body=${encodeURIComponent(SALES_MESSAGE)}`;
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
