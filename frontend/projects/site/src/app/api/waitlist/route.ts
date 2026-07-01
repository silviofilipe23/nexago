import { NextResponse } from 'next/server';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function POST(request: Request) {
  let email: unknown;
  try {
    ({ email } = await request.json());
  } catch {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 });
  }

  if (typeof email !== 'string' || !EMAIL_RE.test(email.trim()) || email.length > 320) {
    return NextResponse.json({ error: 'Informe um e-mail válido.' }, { status: 400 });
  }

  try {
    await addDoc(collection(db, 'waitlist'), {
      email: email.trim().toLowerCase(),
      source: 'site',
      createdAt: serverTimestamp(),
    });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    console.error('[waitlist] create failed:', err);
    return NextResponse.json({ error: 'Não foi possível salvar agora. Tente de novo.' }, { status: 500 });
  }
}
