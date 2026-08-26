import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isActiveStatus, isDraftStatus, rawStatusOf, resolveListingStatus } from './tournament-status.ts';
import type { TournamentStatusInput } from './tournament-status.ts';

const NOW = new Date('2026-08-05T12:00:00-03:00'); // 05/08/2026, meio-dia em São Paulo

function input(over: Partial<TournamentStatusInput> = {}): TournamentStatusInput {
  return {
    rawStatus: 'open',
    startAt: new Date('2026-08-20T09:00:00-03:00'),
    endAt: new Date('2026-08-21T20:00:00-03:00'),
    liveMatchesNow: 0,
    enrolledCount: 0,
    capacity: 32,
    ...over,
  };
}

describe('rawStatusOf', () => {
  it('prefere listingStatus ao status legado', () => {
    assert.equal(rawStatusOf({ listingStatus: 'cancelled', status: 'open' }), 'cancelled');
  });

  it('cai pro status quando não há listingStatus (docs de prod)', () => {
    assert.equal(rawStatusOf({ status: 'Completed' }), 'Completed');
  });

  it('ignora listingStatus vazio', () => {
    assert.equal(rawStatusOf({ listingStatus: '  ', status: 'Open' }), 'Open');
  });

  it('devolve vazio quando não há nenhum dos dois', () => {
    assert.equal(rawStatusOf({}), '');
  });
});

describe('isDraftStatus', () => {
  for (const raw of ['draft', 'Draft', 'rascunho', 'programado']) {
    it(`reconhece "${raw}"`, () => assert.equal(isDraftStatus(raw), true));
  }
  for (const raw of ['open', 'closed', 'cancelled', '']) {
    it(`não confunde "${raw}" com rascunho`, () => assert.equal(isDraftStatus(raw), false));
  }
});

describe('resolveListingStatus — vocabulário real do Firestore', () => {
  it('open vira "inscrições abertas"', () => {
    assert.equal(resolveListingStatus(input({ rawStatus: 'open' }), NOW), 'open');
  });

  it('closed vira "inscrições encerradas", não "últimas vagas"', () => {
    assert.equal(resolveListingStatus(input({ rawStatus: 'closed' }), NOW), 'closed');
  });

  it('cancelled não é colapsado em encerrado', () => {
    assert.equal(resolveListingStatus(input({ rawStatus: 'cancelled' }), NOW), 'cancelled');
  });

  it('completed vira encerrado', () => {
    assert.equal(resolveListingStatus(input({ rawStatus: 'completed' }), NOW), 'ended');
  });

  it('aceita o legado capitalizado de prod', () => {
    assert.equal(resolveListingStatus(input({ rawStatus: 'Completed' }), NOW), 'ended');
    assert.equal(resolveListingStatus(input({ rawStatus: 'Open' }), NOW), 'open');
  });

  it('aceita os legados em português', () => {
    assert.equal(resolveListingStatus(input({ rawStatus: 'Em andamento' }), NOW), 'live');
    assert.equal(resolveListingStatus(input({ rawStatus: 'Concluído' }), NOW), 'ended');
    assert.equal(resolveListingStatus(input({ rawStatus: 'Cancelado' }), NOW), 'cancelled');
    assert.equal(resolveListingStatus(input({ rawStatus: 'Inscrições encerradas' }), NOW), 'closed');
  });
});

describe('resolveListingStatus — a data corrige o status desatualizado', () => {
  it('torneio que já terminou é encerrado mesmo gravado como open', () => {
    const past = input({
      rawStatus: 'open',
      startAt: new Date('2026-07-25T09:00:00-03:00'),
      endAt: new Date('2026-07-26T20:00:00-03:00'),
    });
    assert.equal(resolveListingStatus(past, NOW), 'ended');
  });

  it('usa startAt quando não há endAt', () => {
    const past = input({ rawStatus: 'open', startAt: new Date('2026-07-26T09:00:00-03:00'), endAt: null });
    assert.equal(resolveListingStatus(past, NOW), 'ended');
  });

  it('cancelado continua cancelado depois da data — não vira encerrado', () => {
    const past = input({
      rawStatus: 'cancelled',
      startAt: new Date('2026-07-25T09:00:00-03:00'),
      endAt: new Date('2026-07-26T20:00:00-03:00'),
    });
    assert.equal(resolveListingStatus(past, NOW), 'cancelled');
  });

  it('gravado como live mas com a data passada é encerrado', () => {
    const past = input({
      rawStatus: 'live',
      startAt: new Date('2026-07-25T09:00:00-03:00'),
      endAt: new Date('2026-07-26T20:00:00-03:00'),
    });
    assert.equal(resolveListingStatus(past, NOW), 'ended');
  });

  it('no dia do evento, torneio aberto está ao vivo', () => {
    const today = input({
      rawStatus: 'open',
      startAt: new Date('2026-08-05T08:00:00-03:00'),
      endAt: new Date('2026-08-05T22:00:00-03:00'),
    });
    assert.equal(resolveListingStatus(today, NOW), 'live');
  });

  it('a virada do dia é a de São Paulo, não a do servidor em UTC', () => {
    // 05/08 21h SP = 06/08 00h UTC. Pelo fuso do servidor seria "amanhã" e não daria ao vivo.
    const nightInBrazil = new Date('2026-08-05T21:00:00-03:00');
    const today = input({
      rawStatus: 'open',
      startAt: new Date('2026-08-05T08:00:00-03:00'),
      endAt: new Date('2026-08-05T23:30:00-03:00'),
    });
    assert.equal(resolveListingStatus(today, nightInBrazil), 'live');
  });

  it('partida em quadra manda em qualquer status gravado', () => {
    assert.equal(resolveListingStatus(input({ rawStatus: 'open', liveMatchesNow: 3 }), NOW), 'live');
  });

  it('mas não ressuscita um torneio cancelado', () => {
    assert.equal(resolveListingStatus(input({ rawStatus: 'cancelled', liveMatchesNow: 3 }), NOW), 'cancelled');
  });
});

describe('resolveListingStatus — fallback sem status legível', () => {
  it('deriva "últimas vagas" da lotação', () => {
    const t = input({ rawStatus: '', capacity: 32, enrolledCount: 29 });
    assert.equal(resolveListingStatus(t, NOW), 'almost_full');
  });

  it('deriva "inscrições encerradas" quando lotou', () => {
    const t = input({ rawStatus: '', capacity: 32, enrolledCount: 32 });
    assert.equal(resolveListingStatus(t, NOW), 'closed');
  });

  it('doc sem capacidade não é tratado como lotado', () => {
    const t = input({ rawStatus: '', capacity: null, enrolledCount: 0 });
    assert.equal(resolveListingStatus(t, NOW), 'open');
  });

  it('doc legado sem status nem data fica aberto em vez de sumir', () => {
    const t = input({ rawStatus: '', startAt: null, endAt: null, capacity: null });
    assert.equal(resolveListingStatus(t, NOW), 'open');
  });

  it('status explícito manda sobre a lotação', () => {
    // O portal do atleta faz o mesmo: só deriva da lotação quando não há status legível.
    const t = input({ rawStatus: 'open', capacity: 32, enrolledCount: 32 });
    assert.equal(resolveListingStatus(t, NOW), 'open');
  });
});

describe('isActiveStatus', () => {
  it('inscrição encerrada ainda é ativo — o evento não passou', () => {
    assert.equal(isActiveStatus('closed'), true);
  });

  it('aberto, últimas vagas e ao vivo são ativos', () => {
    assert.equal(isActiveStatus('open'), true);
    assert.equal(isActiveStatus('almost_full'), true);
    assert.equal(isActiveStatus('live'), true);
  });

  it('encerrado e cancelado não são', () => {
    assert.equal(isActiveStatus('ended'), false);
    assert.equal(isActiveStatus('cancelled'), false);
  });
});

describe('os 5 torneios reais do Firestore de dev em 05/08/2026', () => {
  const cases: { name: string; doc: Partial<TournamentStatusInput>; expected: string }[] = [
    {
      name: 'Etapa teste (cancelled, 21-22/08)',
      doc: {
        rawStatus: 'cancelled',
        startAt: new Date('2026-08-21T09:00:00-03:00'),
        endAt: new Date('2026-08-22T20:00:00-03:00'),
        capacity: 16,
      },
      expected: 'cancelled',
    },
    {
      name: 'saque de ouro (open, 16/08)',
      doc: {
        rawStatus: 'open',
        startAt: new Date('2026-08-16T09:00:00-03:00'),
        endAt: new Date('2026-08-16T20:00:00-03:00'),
        capacity: 40,
      },
      expected: 'open',
    },
    {
      name: 'Copa Goiás (open, 15-16/08)',
      doc: {
        rawStatus: 'open',
        startAt: new Date('2026-08-15T09:00:00-03:00'),
        endAt: new Date('2026-08-16T20:00:00-03:00'),
        capacity: 64,
      },
      expected: 'open',
    },
    {
      name: 'Torneio seed nexaGO (closed, 160/160, 14-15/08)',
      doc: {
        rawStatus: 'closed',
        startAt: new Date('2026-08-14T09:00:00-03:00'),
        endAt: new Date('2026-08-15T20:00:00-03:00'),
        capacity: 160,
        enrolledCount: 160,
      },
      expected: 'closed',
    },
    {
      name: 'Copa VH (cancelled, 25-26/07 — já passou)',
      doc: {
        rawStatus: 'cancelled',
        startAt: new Date('2026-07-25T09:00:00-03:00'),
        endAt: new Date('2026-07-26T20:00:00-03:00'),
        capacity: 96,
        enrolledCount: 1,
      },
      expected: 'cancelled',
    },
  ];

  for (const c of cases) {
    it(`${c.name} → ${c.expected}`, () => {
      assert.equal(resolveListingStatus(input(c.doc), NOW), c.expected);
    });
  }
});
