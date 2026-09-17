import {
  withdrawalDecisionMessage,
  withdrawalQueueSubtitle,
  withdrawalRequestedByStaffName,
} from './withdrawals.repository';

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

describe('withdrawalRequestedByStaffName', () => {
  it('gestor da equipe com nome pedindo', () => {
    expect(withdrawalRequestedByStaffName({
      kind: 'organizer', requestedByStaff: true, requestedByName: 'Marina', requesterName: 'Harlan',
    } as never)).toBe('Marina');
  });

  it('gestor da equipe sem nome não cai no nome do dono', () => {
    expect(withdrawalRequestedByStaffName({
      kind: 'organizer', requestedByStaff: true, requestedByName: '', requesterName: 'Harlan',
    } as never)).toBe('gestor da equipe');
  });

  it('o próprio dono pedindo não tem "pedido por"', () => {
    expect(withdrawalRequestedByStaffName({
      kind: 'organizer', requestedByStaff: false, requestedByName: 'Harlan', requesterName: 'Harlan',
    } as never)).toBeNull();
  });

  it('saque de arena nunca tem "pedido por"', () => {
    expect(withdrawalRequestedByStaffName({
      kind: 'arena', requesterName: 'Arena Central',
    } as never)).toBeNull();
  });
});

describe('withdrawalDecisionMessage', () => {
  const staffRow = {
    kind: 'organizer', requesterName: 'Harlan', requestedByStaff: true, requestedByName: 'Marina',
  } as never;
  const ownerRow = {
    kind: 'organizer', requesterName: 'Harlan', requestedByStaff: false, requestedByName: 'Harlan',
  } as never;
  const arenaRow = {
    kind: 'arena', requesterName: 'Arena Central',
  } as never;

  it('recusa pedida por gestor cita quem pediu', () => {
    expect(withdrawalDecisionMessage(staffRow, 'rejected', 'R$ 600,00')).toBe(
      'Saque de R$ 600,00 de Harlan recusado (pedido por Marina) — o valor voltou para a carteira.',
    );
  });

  it('recusa pedida pelo dono não cita mais ninguém', () => {
    expect(withdrawalDecisionMessage(ownerRow, 'rejected', 'R$ 600,00')).toBe(
      'Saque de R$ 600,00 de Harlan recusado — o valor voltou para a carteira.',
    );
  });

  it('pago por fora pedido por gestor cita quem pediu', () => {
    expect(withdrawalDecisionMessage(staffRow, 'approved_manual', 'R$ 600,00')).toBe(
      'Saque de R$ 600,00 de Harlan marcado como pago por fora (pedido por Marina).',
    );
  });

  it('pago por fora pedido pelo dono não cita mais ninguém', () => {
    expect(withdrawalDecisionMessage(ownerRow, 'approved_manual', 'R$ 600,00')).toBe(
      'Saque de R$ 600,00 de Harlan marcado como pago por fora.',
    );
  });

  it('PIX aprovado pedido por gestor diz pra quem o dinheiro foi de verdade', () => {
    expect(withdrawalDecisionMessage(staffRow, 'approved', 'R$ 600,00')).toBe(
      'PIX de R$ 600,00 enviado para Marina, gestor do evento de Harlan.',
    );
  });

  it('PIX aprovado pedido pelo dono mantém a frase original', () => {
    expect(withdrawalDecisionMessage(ownerRow, 'approved', 'R$ 600,00')).toBe(
      'PIX de R$ 600,00 enviado para Harlan.',
    );
  });

  it('saque de arena nunca menciona gestor da equipe', () => {
    expect(withdrawalDecisionMessage(arenaRow, 'approved', 'R$ 600,00')).toBe(
      'PIX de R$ 600,00 enviado para Arena Central.',
    );
  });
});
