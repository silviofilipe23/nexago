import {
  withdrawalDecisionMessage,
  withdrawalEventName,
  withdrawalQueueSubtitle,
  withdrawalRequestedByStaffName,
  withdrawalRequesterLine,
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

describe('withdrawalEventName', () => {
  it('mostra o nome do evento gravado', () => {
    expect(withdrawalEventName({ tournamentName: 'Copa Goiás' } as never)).toBe('Copa Goiás');
  });

  it('sem tournamentName não inventa nome', () => {
    expect(withdrawalEventName({ tournamentName: '' } as never)).toBe('Evento não identificado');
  });
});

describe('withdrawalRequesterLine', () => {
  it('gestor da equipe pedindo mostra o nome dele', () => {
    expect(withdrawalRequesterLine({
      kind: 'organizer', requestedByStaff: true, requestedByName: 'Marina', requesterName: 'Harlan',
    } as never)).toBe('Marina (gestor da equipe)');
  });

  it('o próprio dono pedindo não fica em branco — diz isso explicitamente', () => {
    expect(withdrawalRequesterLine({
      kind: 'organizer', requestedByStaff: false, requestedByName: 'Harlan', requesterName: 'Harlan',
    } as never)).toBe('O próprio organizador');
  });
});

describe('withdrawalDecisionMessage', () => {
  const staffRow = {
    kind: 'organizer', requesterName: 'Harlan', tournamentName: 'Copa Goiás',
    requestedByStaff: true, requestedByName: 'Marina',
  } as never;
  const ownerRowData = {
    kind: 'organizer', requesterName: 'Harlan', tournamentName: 'Copa Goiás',
    requestedByStaff: false, requestedByName: 'Harlan',
  };
  const ownerRow = ownerRowData as never;
  const noEventRow = {
    kind: 'organizer', requesterName: 'Harlan', tournamentName: '',
    requestedByStaff: false, requestedByName: 'Harlan',
  } as never;
  const arenaRow = {
    kind: 'arena', requesterName: 'Arena Central',
  } as never;

  it('recusa pedida por gestor cita o evento e quem pediu', () => {
    expect(withdrawalDecisionMessage(staffRow, 'rejected', 'R$ 600,00')).toBe(
      'Saque de R$ 600,00 do evento Copa Goiás recusado (pedido por Marina) — o valor voltou para a carteira.',
    );
  });

  it('recusa pedida pelo dono cita o evento e não cita mais ninguém', () => {
    expect(withdrawalDecisionMessage(ownerRow, 'rejected', 'R$ 600,00')).toBe(
      'Saque de R$ 600,00 do evento Copa Goiás recusado — o valor voltou para a carteira.',
    );
  });

  it('recusa sem evento gravado não inventa nome', () => {
    expect(withdrawalDecisionMessage(noEventRow, 'rejected', 'R$ 600,00')).toBe(
      'Saque de R$ 600,00 do evento Evento não identificado recusado — o valor voltou para a carteira.',
    );
  });

  it('pago por fora pedido por gestor cita o evento e quem pediu', () => {
    expect(withdrawalDecisionMessage(staffRow, 'approved_manual', 'R$ 600,00')).toBe(
      'Saque de R$ 600,00 do evento Copa Goiás marcado como pago por fora (pedido por Marina).',
    );
  });

  it('pago por fora pedido pelo dono cita o evento e não cita mais ninguém', () => {
    expect(withdrawalDecisionMessage(ownerRow, 'approved_manual', 'R$ 600,00')).toBe(
      'Saque de R$ 600,00 do evento Copa Goiás marcado como pago por fora.',
    );
  });

  it('PIX aprovado pedido por gestor cita o evento e diz pra quem o dinheiro foi de verdade', () => {
    expect(withdrawalDecisionMessage(staffRow, 'approved', 'R$ 600,00')).toBe(
      'PIX de R$ 600,00 do evento Copa Goiás enviado para Marina (gestor da equipe).',
    );
  });

  it('PIX aprovado pedido pelo dono cita o evento', () => {
    expect(withdrawalDecisionMessage(ownerRow, 'approved', 'R$ 600,00')).toBe(
      'PIX de R$ 600,00 do evento Copa Goiás enviado para Harlan.',
    );
  });

  it('dois saques do mesmo dono em eventos diferentes não geram a mesma frase', () => {
    const outroEvento = { ...ownerRowData, tournamentName: 'Etapa Recife' } as never;
    expect(withdrawalDecisionMessage(ownerRow, 'approved', 'R$ 600,00')).not.toBe(
      withdrawalDecisionMessage(outroEvento, 'approved', 'R$ 600,00'),
    );
  });

  it('saque de arena recusado mantém a frase original, sem evento', () => {
    expect(withdrawalDecisionMessage(arenaRow, 'rejected', 'R$ 600,00')).toBe(
      'Saque de R$ 600,00 de Arena Central recusado — o valor voltou para a carteira.',
    );
  });

  it('saque de arena pago por fora mantém a frase original, sem evento', () => {
    expect(withdrawalDecisionMessage(arenaRow, 'approved_manual', 'R$ 600,00')).toBe(
      'Saque de R$ 600,00 de Arena Central marcado como pago por fora.',
    );
  });

  it('saque de arena aprovado mantém a frase original, sem evento nem gestor', () => {
    expect(withdrawalDecisionMessage(arenaRow, 'approved', 'R$ 600,00')).toBe(
      'PIX de R$ 600,00 enviado para Arena Central.',
    );
  });
});
