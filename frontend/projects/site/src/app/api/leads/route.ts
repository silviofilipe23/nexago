import { NextResponse } from 'next/server';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PERSONAS = ['organizador', 'arena', 'geral'] as const;
type Persona = (typeof PERSONAS)[number];

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

export async function POST(request: Request) {
  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 });
  }

  const name = str(payload.name);
  const email = str(payload.email);
  const phone = str(payload.phone);
  const org = str(payload.org);
  const message = str(payload.message);
  const persona = str(payload.persona) as Persona;

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
    return NextResponse.json({ error: 'Confira os dados e tente de novo.' }, { status: 400 });
  }

  try {
    await addDoc(collection(db, 'leads'), {
      name,
      email: email.toLowerCase(),
      phone,
      org,
      message,
      persona,
      source: 'site',
      createdAt: serverTimestamp(),
    });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    console.error('[leads] create failed:', err);
    return NextResponse.json({ error: 'Não foi possível enviar agora. Tente de novo.' }, { status: 500 });
  }
}
