import { addDoc, collection, serverTimestamp } from 'firebase/firestore/lite';
import { liteDb } from '../../../lib/firebase-lite';

/**
 * Escrita do formulário de contato — porta de `submitLead` (site Next.js,
 * `src/lib/firestore/public-writes.ts`). Cada scope da migração mantém sua própria cópia
 * mínima da função relevante (evita colisão de arquivo entre agentes rodando em paralelo);
 * mesma coleção (`leads`) e mesmo formato de campos, persona fixa em `'geral'` porque é só
 * o que este formulário envia — pra `firestore.rules` valerem sem alteração.
 */

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export interface ContactInput {
  name: string;
  email: string;
  phone: string;
  message: string;
}

export type ContactResult = { ok: true } | { ok: false; error: string };

export async function submitContactLead(input: ContactInput): Promise<ContactResult> {
  const name = input.name.trim();
  const email = input.email.trim();
  const phone = input.phone.trim();
  const message = input.message.trim();

  // Mesmas regras de `submitLead` para persona 'geral': telefone opcional (só valida
  // comprimento se preenchido), mensagem exige ao menos 2 caracteres.
  const phoneInvalid = phone.length > 0 && (phone.length < 8 || phone.length > 40);
  const messageInvalid = message.length < 2 || message.length > 1000;

  if (
    name.length < 2 ||
    name.length > 120 ||
    !EMAIL_RE.test(email) ||
    email.length > 320 ||
    phoneInvalid ||
    messageInvalid
  ) {
    return { ok: false, error: 'Confira os dados e tente de novo.' };
  }

  try {
    await addDoc(collection(liteDb, 'leads'), {
      name,
      email: email.toLowerCase(),
      phone,
      org: '',
      message,
      persona: 'geral',
      source: 'site',
      createdAt: serverTimestamp(),
    });
    return { ok: true };
  } catch (err) {
    console.error('[leads] create failed:', err);
    return { ok: false, error: 'Não foi possível enviar agora. Tente de novo.' };
  }
}
