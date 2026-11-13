import { bookingContactsKey, bookingWhatsappText, whatsappLink } from './booking-contacts';

describe('WhatsApp da reserva', () => {
  const slot = { dateKey: '2026-11-18', startTime: '19:00', endTime: '20:30', courtName: 'Quadra 7', allocationStatus: null };

  it('mensagem com primeiro nome, arena, dia, horário e quadra', () => {
    expect(bookingWhatsappText(slot, 'Rafael Moura', 'Arena Sol')).toBe(
      'Oi, Rafael! Aqui é da Arena Sol, sobre a reserva de quarta, 18/11, 19:00–20:30, na Quadra 7.',
    );
  });

  it('quadra provisória fica de fora; sem nome nem arena a frase continua inteira', () => {
    expect(bookingWhatsappText({ ...slot, allocationStatus: 'unassigned' }, '', null)).toBe(
      'Oi! Sobre a reserva de quarta, 18/11, 19:00–20:30.',
    );
  });

  it('link do wa.me com o texto codificado', () => {
    expect(whatsappLink('5562982415530', 'Oi, Rafael!')).toBe('https://wa.me/5562982415530?text=Oi%2C%20Rafael!');
  });

  it('chave muda quando entra convidado; reserva de balcão não busca', () => {
    const b = { id: 'b1', athleteId: 'u1', participants: [] };
    expect(bookingContactsKey(b)).toBe('b1|u1');
    expect(bookingContactsKey({ ...b, participants: [{ uid: 'u2', name: 'Bia', avatarUrl: null, via: 'direct' as const, joinedAt: null }] })).toBe('b1|u1|u2');
    expect(bookingContactsKey({ id: 'w', athleteId: '', participants: [] })).toBeNull();
    // Quem entrou pelo placar também tem WhatsApp no card: muda a chave.
    expect(bookingContactsKey({ ...b, resultPlayers: [{ uid: 'u3', name: 'Rafa', avatarUrl: null }] })).toBe('b1|u1|u3');
  });
});
