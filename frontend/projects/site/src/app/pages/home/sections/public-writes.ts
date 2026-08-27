import { addDoc, collection, serverTimestamp } from 'firebase/firestore/lite';
import { liteDb } from '../../../../lib/firebase-lite';

/**
 * Escritas públicas do site (waitlist/leads), portadas de
 * `projects/site/src/lib/firestore/public-writes.ts` (Next.js). Mesmas coleções, mesmos
 * formatos de campo e mesma validação — as `firestore.rules` valem igual nas duas variantes.
 *
 * Usa o SDK **lite** (`firebase/firestore/lite`): só é chamado a partir de componentes com
 * interação (Waitlist/LeadForm) e não precisa do transporte WebChannel de listeners em tempo
 * real — ver `liteDb` em `src/lib/firebase-lite.ts`.
 */

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PERSONAS = ['organizador', 'arena', 'geral'] as const;
export type Persona = (typeof PERSONAS)[number];

export type WriteResult = { ok: true } | { ok: false; error: string };

export async function submitWaitlist(email: string): Promise<WriteResult> {
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

export async function submitLead(input: LeadInput): Promise<WriteResult> {
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
