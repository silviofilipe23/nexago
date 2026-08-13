/** Telefone do atleta para contato direto do organizador. O callable
 *  `getTournamentAthleteContacts` devolve `users/{uid}.phoneNumber` CRU: quem verificou por SMS
 *  tem E.164 (`+5562982406456`), mas cadastro antigo/manual guarda o que o atleta digitou
 *  (`(62) 98240-6456`, `62 98240 6456`). Os dois formatos têm de virar o mesmo link.
 *
 *  Mesma regra de `normalizePhoneForWhatsApp` (functions) e `toE164BR` (portal do atleta) —
 *  duplicada de propósito, como já está entre aqueles dois: não existe lib compartilhada entre
 *  functions e os portais, e criar uma está fora do escopo desta tela. */

/** Só os dígitos, já com o 55 do Brasil — o que `wa.me` e `tel:` esperam.
 *  `null` quando o número é curto demais pra ser telefone (perfil com lixo digitado). */
export function phoneDigitsBR(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length >= 10 && digits.length <= 11) return `55${digits}`;
  if (digits.length >= 12 && digits.length <= 13 && digits.startsWith('55')) return digits;
  return null;
}

/** `https://wa.me/55...` — WhatsApp é o canal real da operação de torneio no Brasil. */
export function whatsAppLink(raw: string): string | null {
  const digits = phoneDigitsBR(raw);
  return digits ? `https://wa.me/${digits}` : null;
}

/** `tel:+55...` — abre o discador no celular e o app de chamadas no desktop. */
export function telLink(raw: string): string | null {
  const digits = phoneDigitsBR(raw);
  return digits ? `tel:+${digits}` : null;
}

/** `(62) 98240-6456` para ler na tela. Número fora do padrão BR aparece como está cadastrado:
 *  é melhor o organizador ver o que existe e decidir do que sumir com o dado. */
export function formatPhoneBR(raw: string): string {
  const digits = phoneDigitsBR(raw);
  if (!digits) return raw.trim();
  const local = digits.slice(2);
  const ddd = local.slice(0, 2);
  const rest = local.slice(2);
  const splitAt = rest.length === 9 ? 5 : 4;
  return `(${ddd}) ${rest.slice(0, splitAt)}-${rest.slice(splitAt)}`;
}
