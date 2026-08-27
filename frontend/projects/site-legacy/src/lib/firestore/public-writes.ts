import { addDoc, collection, serverTimestamp } from 'firebase/firestore/lite';
import { liteDb } from '@/lib/firebase-lite';

/**
 * Escritas públicas do site (waitlist/leads) direto do client SDK.
 *
 * Existiam como Route Handlers, mas eram só um proxy: já usavam o client SDK
 * (chave não é secreta) e a validação real sempre foi das `firestore.rules`.
 * Sem servidor Node (export estático), a escrita sai daqui em vez de `/api/*`.
 *
 * Usa o SDK **lite**: só é chamado de client components (Waitlist/LeadForm/ContactForm),
 * e o SDK completo arrastava o transporte WebChannel para o bundle de toda visita —
 * peso que só faz sentido para listeners em tempo real, que estas escritas não usam.
 * As `firestore.rules` valem igual nas duas variantes.
 */

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PERSONAS = ['organizador', 'arena', 'geral'] as const;
export type Persona = (typeof PERSONAS)[number];

export async function submitWaitlist(email: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const trimmed = email.trim();
  if (!EMAIL_RE.test(trimmed) || trimmed.length > 320) {
    return { ok: false, error: 'Informe um e-mail válido.' };
  }

  try {
    await addDoc(collection(liteDb, 'waitlist'), {
      email: trimmed.toLowerCase(),
      source: 'site',
      createdAt: serverTimestamp(),
    });
    return { ok: true };
  } catch (err) {
    console.error('[waitlist] create failed:', err);
    return { ok: false, error: 'Não foi possível salvar agora. Tente de novo.' };
  }
}

export interface LeadInput {
  name: string;
  email: string;
  phone: string;
  org: string;
  message: string;
  persona: Persona;
}

export async function submitLead(input: LeadInput): Promise<{ ok: true } | { ok: false; error: string }> {
  const name = input.name.trim();
  const email = input.email.trim();
  const phone = input.phone.trim();
  const org = input.org.trim();
  const message = input.message.trim();
  const persona = input.persona;

  const isB2B = persona === 'organizador' || persona === 'arena';
  // B2B (organizador/arena) exige telefone; contato geral o torna opcional.
  const phoneInvalid = phone.length > 0 ? phone.length < 8 || phone.length > 40 : isB2B;
  const messageInvalid = message.length > 1000 || (persona === 'geral' && message.length < 2);

  if (
    name.length < 2 ||
    name.length > 120 ||
    !EMAIL_RE.test(email) ||
    email.length > 320 ||
    phoneInvalid ||
    org.length > 160 ||
    messageInvalid ||
    !PERSONAS.includes(persona)
  ) {
    return { ok: false, error: 'Confira os dados e tente de novo.' };
  }

  try {
    await addDoc(collection(liteDb, 'leads'), {
      name,
      email: email.toLowerCase(),
      phone,
      org,
      message,
      persona,
      source: 'site',
      createdAt: serverTimestamp(),
    });
    return { ok: true };
  } catch (err) {
    console.error('[leads] create failed:', err);
    return { ok: false, error: 'Não foi possível enviar agora. Tente de novo.' };
  }
}
