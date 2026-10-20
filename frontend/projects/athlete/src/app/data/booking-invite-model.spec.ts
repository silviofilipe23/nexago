import {
  bookingInviteFromDoc,
  bookingInviteShareMessage,
  bookingInviteUrl,
  bookingInviteWhenLabel,
  bookingParticipantsOf,
  resolveBookingInviteGate,
  type BookingInvite,
  type BookingInviteGateBooking,
} from './booking-invite-model';

const NOW = new Date('2026-10-24T12:00:00-03:00');

function invite(overrides: Partial<BookingInvite> = {}): BookingInvite {
  return {
    id: 'b1_ana',
    bookingId: 'b1',
    arenaId: 'a1',
    arenaName: 'Arena Sol',
    courtName: 'Quadra 1',
    date: '2026-10-24',
    startTime: '19:00',
    endTime: '20:00',
    invitedByUid: 'dono',
    invitedByName: 'Bruno',
    status: 'pending',
    kind: 'direct',
    inviteeUid: 'ana',
    inviteeName: 'Ana',
    inviteeAvatarUrl: null,
    createdAt: new Date('2026-10-20T10:00:00-03:00'),
    expiresAt: new Date('2026-10-24T20:00:00-03:00'),
    ...overrides,
  };
}

function link(overrides: Partial<BookingInvite> = {}): BookingInvite {
  return invite({ id: 'link_b1', kind: 'link', status: 'open', inviteeUid: null, inviteeName: null, ...overrides });
}

function booking(overrides: Partial<BookingInviteGateBooking> = {}): BookingInviteGateBooking {
  return { status: 'confirmed', ownerUid: 'dono', participantUids: [], ...overrides };
}

function gateOf(inv: BookingInvite, b: BookingInviteGateBooking | null, viewer: string | null) {
  return resolveBookingInviteGate({ invite: inv, booking: b, viewerUid: viewer, now: NOW });
}

describe('resolveBookingInviteGate', () => {
  it('convidado com convite pendente pode responder', () => {
    expect(gateOf(invite(), booking(), 'ana')).toEqual({ gate: 'respond', message: null });
  });

  it('link multiuso aberto vale para qualquer atleta que não seja o dono', () => {
    expect(gateOf(link(), booking(), 'carla').gate).toBe('respond');
  });

  it('dono abrindo o próprio link', () => {
    expect(gateOf(link(), booking(), 'dono').gate).toBe('owner');
  });

  it('quem já está na lista vê "você está no jogo", pelo link ou pelo convite', () => {
    const b = booking({ participantUids: ['ana'] });
    expect(gateOf(link(), b, 'ana').gate).toBe('joined');
    expect(gateOf(invite({ status: 'accepted' }), b, 'ana').gate).toBe('joined');
  });

  it('convite direto de outro atleta é bloqueado', () => {
    expect(gateOf(invite(), booking(), 'carla')).toEqual({
      gate: 'blocked',
      message: 'Este convite é para outro atleta.',
    });
  });

  it('reserva cancelada ou apagada bloqueia antes de tudo, inclusive para o dono', () => {
    const msg = 'Esta reserva foi cancelada.';
    expect(gateOf(invite(), booking({ status: 'canceled' }), 'ana').message).toBe(msg);
    expect(gateOf(invite(), booking({ status: 'cancelled' }), 'dono').message).toBe(msg);
    expect(gateOf(link(), null, 'carla').message).toBe(msg);
  });

  it('quadra completa (dono + 3) bloqueia quem ainda não entrou', () => {
    const full = booking({ participantUids: ['x', 'y', 'z'] });
    expect(gateOf(link(), full, 'carla')).toEqual({ gate: 'blocked', message: 'A quadra já está completa.' });
    // Quem já está dentro continua vendo o jogo.
    expect(gateOf(link(), full, 'x').gate).toBe('joined');
  });

  it('convite pendente não segura vaga: com 2 convidados ainda dá para entrar', () => {
    expect(gateOf(invite(), booking({ participantUids: ['x', 'y'] }), 'ana').gate).toBe('respond');
  });

  it('convite que passou do fim do jogo expirou', () => {
    const expired = invite({ expiresAt: new Date('2026-10-24T11:00:00-03:00') });
    expect(gateOf(expired, booking(), 'ana').message).toBe('Este convite expirou.');
  });

  it('cada resposta já dada explica o bloqueio', () => {
    const cases: Record<string, string> = {
      accepted: 'Este convite já foi aceito.',
      declined: 'Você recusou este convite.',
      canceled: 'Este convite foi cancelado.',
      left: 'Você saiu deste jogo.',
      removed: 'Você não está mais neste jogo.',
      whatever: 'Este convite não está mais disponível.',
    };
    for (const [status, message] of Object.entries(cases)) {
      expect(gateOf(invite({ status }), booking(), 'ana')).toEqual({ gate: 'blocked', message });
    }
  });

  it('link encerrado (reserva cancelada pelo gatilho) não aceita mais ninguém', () => {
    expect(gateOf(link({ status: 'canceled' }), booking(), 'carla').message).toBe('Este convite foi cancelado.');
  });

  it('sem sessão pede login, mas só depois dos bloqueios que valem para todos', () => {
    expect(gateOf(link(), booking(), null).gate).toBe('signIn');
    expect(gateOf(link(), booking({ status: 'canceled' }), null).gate).toBe('blocked');
  });
});

describe('bookingInviteFromDoc', () => {
  it('lê o link multiuso (sem inviteeUid) e o convite legado (sem kind)', () => {
    const ts = (iso: string) => ({ toDate: () => new Date(iso) });
    const shareLink = bookingInviteFromDoc('link_b1', {
      bookingId: 'b1',
      kind: 'link',
      status: 'open',
      date: '2026-10-24',
      startTime: '19:00:00',
      expiresAt: ts('2026-10-24T23:00:00Z'),
    });
    expect(shareLink.kind).toBe('link');
    expect(shareLink.inviteeUid).toBeNull();
    expect(shareLink.startTime).toBe('19:00');
    expect(shareLink.expiresAt?.toISOString()).toBe('2026-10-24T23:00:00.000Z');

    const legacy = bookingInviteFromDoc('old', { bookingId: 'b1', createdAt: ts('2026-06-01T12:00:00Z') });
    expect(legacy.kind).toBe('direct');
    expect(legacy.status).toBe('pending');
    // Legado: criação + 48h.
    expect(legacy.expiresAt?.toISOString()).toBe('2026-06-03T12:00:00.000Z');
  });
});

describe('bookingParticipantsOf', () => {
  it('ignora entrada sem uid e uid repetido', () => {
    const list = bookingParticipantsOf([
      { uid: 'ana', name: 'Ana', via: 'link', avatarUrl: 'https://x/a.jpg' },
      { uid: 'ana', name: 'Ana de novo' },
      { name: 'Sem uid' },
      { uid: 'beto' },
      'lixo',
    ]);
    expect(list).toEqual([
      { uid: 'ana', name: 'Ana', avatarUrl: 'https://x/a.jpg', via: 'link' },
      { uid: 'beto', name: 'Atleta', avatarUrl: null, via: 'direct' },
    ]);
    expect(bookingParticipantsOf(undefined)).toEqual([]);
  });
});

describe('link e mensagem do convite', () => {
  it('aponta para /convite/{id} no portal do atleta', () => {
    expect(bookingInviteUrl('link_b1')).toBe('https://atleta.nexago.com.br/convite/link_b1');
  });

  it('dia da semana e horário de parede, sem passar por fuso', () => {
    expect(bookingInviteWhenLabel('2026-10-24', '19:00')).toBe('sábado, 24/10 às 19:00');
    expect(bookingInviteWhenLabel('2026-10-25', '')).toBe('domingo, 25/10');
    expect(bookingInviteWhenLabel('', '19:00')).toBe('19:00');
  });

  it('mesmo texto do app, com as vagas que faltam', () => {
    const base = { arenaName: 'Arena Sol', date: '2026-10-24', startTime: '19:00', inviteId: 'link_b1' };
    expect(bookingInviteShareMessage({ ...base, openSlots: 2 })).toBe(
      'Bora jogar? Tenho quadra na Arena Sol, sábado, 24/10 às 19:00. Faltam 2 pra fechar o jogo. ' +
        'Confirma sua vaga pelo nexaGO: https://atleta.nexago.com.br/convite/link_b1',
    );
    expect(bookingInviteShareMessage({ ...base, arenaName: ' ', openSlots: 1 })).toContain(
      'Tenho quadra na arena, sábado, 24/10 às 19:00. Falta 1 pra fechar o jogo.',
    );
  });
});
