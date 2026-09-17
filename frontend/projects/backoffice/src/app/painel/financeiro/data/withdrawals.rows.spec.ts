import { withdrawalQueueSubtitle } from './withdrawals.repository';

describe('withdrawalQueueSubtitle', () => {
  it('saque de organizador mostra o evento e quem pediu', () => {
    expect(withdrawalQueueSubtitle({
      kind: 'organizer', tournamentName: 'Copa Goiás', requesterName: 'Harlan',
      requestedByName: 'Marina', requestedByStaff: true,
    } as never)).toBe('Copa Goiás · pedido por Marina (gestor da equipe)');
  });

  it('pedido do próprio dono não repete o papel', () => {
    expect(withdrawalQueueSubtitle({
      kind: 'organizer', tournamentName: 'Copa Goiás', requesterName: 'Harlan',
      requestedByName: 'Harlan', requestedByStaff: false,
    } as never)).toBe('Copa Goiás · pedido pelo dono');
  });

  it('sem evento gravado não inventa nome', () => {
    expect(withdrawalQueueSubtitle({
      kind: 'organizer', tournamentName: '', requesterName: 'Harlan',
      requestedByName: 'Harlan', requestedByStaff: false,
    } as never)).toBe('Evento não identificado · pedido pelo dono');
  });

  it('saque de arena não fala de evento', () => {
    expect(withdrawalQueueSubtitle({
      kind: 'arena', requesterName: 'Arena Central',
    } as never)).toBe('Arena Central');
  });
});
