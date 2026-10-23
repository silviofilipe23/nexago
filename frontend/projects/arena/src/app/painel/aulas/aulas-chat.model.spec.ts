import { Timestamp } from 'firebase/firestore';
import { chargeMessageText, whatsappChargeLink } from './billing.model';
import {
  aulaConversationFromDoc,
  aulaPreview,
  aulaUnreadTotal,
  hasAulaChat,
  myAulaConversations,
  type AulaConversation,
} from './aulas-chat.model';

function snap(id: string, data: Record<string, unknown> | undefined) {
  return { id, data: () => data } as never;
}

function conv(over: Partial<AulaConversation>): AulaConversation {
  return {
    id: 's_a1_me_u1',
    arenaId: 'a1',
    staffUid: 'me',
    athleteUid: 'u1',
    athleteName: 'Carla',
    athletePhotoUrl: null,
    arenaName: 'Arena Sol',
    memberIds: ['me', 'u1'],
    closed: false,
    lastAt: null,
    lastMessage: null,
    unread: {},
    ...over,
  };
}

describe('chat das Aulas (modelo)', () => {
  it('só quem tem conta NexaGO fala pelo chat', () => {
    expect(hasAulaChat('u1')).toBeTrue();
    expect(hasAulaChat('  ')).toBeFalse();
    expect(hasAulaChat(null)).toBeFalse();
  });

  it('lê a conversa arena_student e ignora os outros tipos', () => {
    const c = aulaConversationFromDoc(
      snap('s_a1_me_u1', {
        kind: 'arena_student',
        arenaId: 'a1',
        arenaName: 'Arena Sol',
        professorUid: 'me',
        athleteUid: 'u1',
        memberIds: ['me', 'u1'],
        memberNames: { me: 'Ana', u1: 'Carla Dias' },
        memberPhotos: { u1: 'https://x/p.jpg' },
        lastAt: Timestamp.fromDate(new Date('2026-10-20T15:00:00Z')),
        lastMessage: { text: 'Pago!', senderUid: 'u1' },
        unread: { me: 2 },
      }),
    )!;
    expect(c.staffUid).toBe('me');
    expect(c.athleteName).toBe('Carla Dias');
    expect(c.athletePhotoUrl).toBe('https://x/p.jpg');
    expect(c.unread['me']).toBe(2);
    expect(aulaConversationFromDoc(snap('a_a1_p1', { kind: 'arena' }))).toBeNull();
    expect(aulaConversationFromDoc(snap('x', undefined))).toBeNull();
  });

  it('caixa: só desta arena e abertas por mim, a mais recente primeiro; soma as não lidas', () => {
    const list = [
      conv({ id: 'velha', lastAt: new Date(1000), unread: { me: 1 } }),
      conv({ id: 'nova', lastAt: new Date(5000), unread: { me: 2 } }),
      conv({ id: 'outra-arena', arenaId: 'a9', unread: { me: 9 } }),
      conv({ id: 'de-outra-pessoa', staffUid: 'rui', unread: { rui: 9 } }),
    ];
    const mine = myAulaConversations(list, 'a1', 'me');
    expect(mine.map((c) => c.id)).toEqual(['nova', 'velha']);
    expect(aulaUnreadTotal(mine, 'me')).toBe(3);
    expect(myAulaConversations(list, 'a1', null)).toEqual([]);
  });

  it('resumo marca o que eu mandei', () => {
    expect(aulaPreview(conv({ lastMessage: { text: 'Oi', senderUid: 'me' } }), 'me')).toBe('Você: Oi');
    expect(aulaPreview(conv({ lastMessage: { text: 'Pago!', senderUid: 'u1' } }), 'me')).toBe('Pago!');
    expect(aulaPreview(conv({}), 'me')).toBe('Nenhuma mensagem ainda');
  });

  it('a cobrança é o mesmo texto no chat e no WhatsApp', () => {
    const charge = { description: 'Mensal 2x', amountReais: 320, dueDate: '2026-11-05' };
    const text = chargeMessageText('Carla Dias', charge, 'Arena Sol', 'https://pay/x');
    expect(text).toContain('Olá, Carla!');
    expect(text).toContain('05/11/2026');
    expect(text).toContain('https://pay/x');
    expect(whatsappChargeLink('11999990000', 'Carla Dias', charge, 'Arena Sol', 'https://pay/x')).toBe(
      `https://wa.me/5511999990000?text=${encodeURIComponent(text)}`,
    );
  });
});
