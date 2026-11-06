import type { TournamentRow } from '../../data/tournaments.repository';
import { buildFeeRow } from '../../taxas/data/fee-rows';
import type { FeeRule } from '../../taxas/data/tournament-fees';
import {
  EMPTY_TOTALS,
  commissionByTournament,
  commissionFromRaw,
  contractReceivedCents,
  costsCents,
  costsLabel,
  feeBadge,
  feeCents,
  hasMoney,
  inPeriod,
  ledgerLineFromRaw,
  matchesFilter,
  matchesTerm,
  monthSeries,
  netCents,
  offPlatformCentsOf,
  paymentRows,
  paymentsCsv,
  sortRows,
  sumRows,
  takeRate,
  totalsOf,
  type LedgerLine,
  type RevenueRow,
} from './tournament-revenue';

const TODAY = '2026-11-06';
const DEFAULTS: FeeRule = { percent: 8, floorReais: 1.5, payer: 'organizador' };

function tournament(id: string, startAt: Date | null = null, name = `Torneio ${id}`): TournamentRow {
  return {
    id, name, sport: null, status: 'inscricoes', visibility: null, startAt, place: null,
    categoriesCount: 1, capacity: null, managerId: 'o1', entryFeeReais: null,
  };
}

function line(id: string, over: Partial<Record<string, unknown>> = {}): LedgerLine {
  return ledgerLineFromRaw(id, {
    type: 'credit', grossReais: 160, platformFeeReais: 12.8, gatewayFeeReais: 0, netReais: 147.2,
    cashbackAppliedReais: 0, squadDiscountReais: 0, registrationId: `r-${id}`, payerUid: `u-${id}`, ...over,
  })!;
}

function row(id: string, lines: LedgerLine[], extra: Partial<RevenueRow> = {}): RevenueRow {
  return {
    tournament: tournament(id), organizerName: null, fee: null, totals: totalsOf(lines),
    offPlatformCents: 0, awaitingCents: 0, ...extra,
  };
}

describe('arrecadação: leitura do extrato do caixa', () => {
  it('converte reais em centavos sem resíduo de float', () => {
    // O extrato grava duas casas; 4,35 × 100 = 434,999… no float.
    const l = line('a', { grossReais: 0.1 + 0.2, platformFeeReais: 4.35 });
    expect(l.grossCents).toBe(30);
    expect(l.organizerFeeCents).toBe(435);
  });

  it('só crédito vira linha; campo ausente vale zero', () => {
    expect(ledgerLineFromRaw('x', { type: 'debit', grossReais: 10 })).toBeNull();
    expect(ledgerLineFromRaw('x', undefined)).toBeNull();
    const l = ledgerLineFromRaw('x', { type: 'credit', grossReais: 10 })!;
    expect(l.athleteFeeCents).toBe(0);
    expect(l.cashbackCents).toBe(0);
  });

  it('cartão = tarifa do organizador ou antecipação paga pelo atleta; senão Pix', () => {
    expect(line('a').method).toBe('pix');
    expect(line('b', { gatewayFeeReais: 4.5 }).method).toBe('card');
    expect(line('c', { cardFeeReais: 2.1 }).method).toBe('card');
  });

  it('comissão só conta liberada ou paga', () => {
    const base = { tournamentId: 't1', amountCents: 800, registrationId: 'r', payerUid: 'u' };
    expect(commissionFromRaw({ ...base, status: 'released' })?.amountCents).toBe(800);
    expect(commissionFromRaw({ ...base, status: 'paid' })).not.toBeNull();
    expect(commissionFromRaw({ ...base, status: 'pending' })).toBeNull();
    expect(commissionFromRaw({ ...base, status: 'canceled' })).toBeNull();
    const sums = commissionByTournament([commissionFromRaw({ ...base, status: 'paid' })!, commissionFromRaw({ ...base, status: 'released' })!]);
    expect(sums.get('t1')).toBe(1600);
  });
});

describe('arrecadação: receita da NexaGO', () => {
  it('receita = taxa do organizador + do atleta − cashback − desconto e comissão do Squad', () => {
    const t = totalsOf(
      [
        line('a'),
        line('b', { serviceFeeReais: 6 }),
        line('c', { cashbackAppliedReais: 16 }),
        line('d', { squadDiscountReais: 8 }),
      ],
      500,
    );
    expect(feeCents(t)).toBe(4 * 1280 + 600);
    expect(costsCents(t)).toBe(1600 + 800 + 500);
    expect(netCents(t)).toBe(5720 - 2900);
    expect(t.grossCents).toBe(64000);
    expect(takeRate(t)).toBeCloseTo(2820 / 64000, 10);
  });

  it('cashback maior que a taxa deixa o líquido negativo; sem pagamento não há %', () => {
    expect(netCents(totalsOf([line('a', { cashbackAppliedReais: 16 })]))).toBe(-320);
    expect(takeRate(EMPTY_TOTALS)).toBeNull();
  });

  it('por fora lê o recorte; doc antigo cai no canal do paymentMode', () => {
    expect(offPlatformCentsOf({ collectedViaOrganizerCents: 64000, collectedCents: 90000 })).toBe(64000);
    expect(offPlatformCentsOf({ collectedViaOrganizerCents: 0, collectedCents: 90000, paymentMode: 'directWithOrganizer' })).toBe(0);
    expect(offPlatformCentsOf({ collectedCents: 90000, paymentMode: 'directWithOrganizer' })).toBe(90000);
    expect(offPlatformCentsOf({ collectedCents: 90000, paymentMode: 'appPixCard' })).toBe(0);
  });

  it('plano recebido: sinal pago = sinal; pago ou concluído = preço; o resto, nada', () => {
    const c = { depositCents: 50000, priceCents: 120000 };
    expect(contractReceivedCents({ ...c, status: 'deposit_paid' })).toBe(50000);
    expect(contractReceivedCents({ ...c, status: 'paid' })).toBe(120000);
    expect(contractReceivedCents({ ...c, status: 'completed' })).toBe(120000);
    expect(contractReceivedCents({ ...c, status: 'requested' })).toBe(0);
    expect(contractReceivedCents({ ...c, status: 'cancelled' })).toBe(0);
  });
});

describe('arrecadação: tabela', () => {
  it('só entra quem teve dinheiro; filtros por canal', () => {
    const plataforma = row('p', [line('a')]);
    const porFora = row('f', [], { offPlatformCents: 1000 });
    const aLiberar = row('l', [], { awaitingCents: 500 });
    const vazio = row('v', []);
    expect([plataforma, porFora, aLiberar, vazio].filter(hasMoney).map((r) => r.tournament.id)).toEqual(['p', 'f', 'l']);
    expect(matchesFilter(plataforma, 'plataforma')).toBeTrue();
    expect(matchesFilter(porFora, 'plataforma')).toBeFalse();
    expect(matchesFilter(porFora, 'por-fora')).toBeTrue();
    expect(matchesFilter(row('m', [line('a')], { offPlatformCents: 1000 }), 'por-fora')).toBeFalse();
  });

  it('busca pelo torneio ou organizador, sem acento', () => {
    const r = { ...row('a', []), tournament: tournament('a', null, 'Copa Verão'), organizerName: 'Arena Sol' };
    expect(matchesTerm(r, 'verao')).toBeTrue();
    expect(matchesTerm(r, 'ARENA')).toBeTrue();
    expect(matchesTerm(r, 'liga')).toBeFalse();
    expect(matchesTerm(r, '  ')).toBeTrue();
  });

  it('ordena por receita, volume ou data (sem data no fim)', () => {
    const a = { ...row('a', [line('1')]), tournament: tournament('a', new Date('2026-10-01T12:00:00Z')) };
    const b = { ...row('b', [line('1'), line('2')]), tournament: tournament('b', null) };
    const c = { ...row('c', [], { offPlatformCents: 900000 }), tournament: tournament('c', new Date('2026-11-01T12:00:00Z')) };
    expect(sortRows([a, b, c], 'receita').map((r) => r.tournament.id)).toEqual(['b', 'a', 'c']);
    expect(sortRows([a, b, c], 'volume').map((r) => r.tournament.id)).toEqual(['c', 'b', 'a']);
    expect(sortRows([b, a, c], 'data').map((r) => r.tournament.id)).toEqual(['c', 'a', 'b']);
  });

  it('soma das linhas', () => {
    const s = sumRows([row('a', [line('1')], { offPlatformCents: 100, awaitingCents: 7 }), row('b', [line('2')], { offPlatformCents: 50 })]);
    expect(s.totals.payments).toBe(2);
    expect(s.offPlatformCents).toBe(150);
    expect(s.awaitingCents).toBe(7);
  });

  it('selo da taxa com os rótulos da tela de Taxas', () => {
    const fee = buildFeeRow(tournament('a'), undefined, undefined, DEFAULTS, TODAY);
    expect(feeBadge(fee)).toEqual({ label: '8% · padrão', tone: 'dim' });
    const isento = buildFeeRow(tournament('a'), { tournamentId: 'a', version: 1, override: { mode: 'isento', percent: 0, floorReais: 0, payer: 'organizador', reason: 'Evento beneficente', until: null } }, undefined, DEFAULTS, TODAY);
    expect(feeBadge(isento).label).toBe('Isento');
    expect(feeBadge(buildFeeRow(tournament('a'), undefined, { name: null, commissionPercent: 6 }, DEFAULTS, TODAY)).label).toBe('6% · do cadastro');
    expect(feeBadge(null).label).toBe('…');
  });
});

describe('arrecadação: período pela data do torneio em São Paulo', () => {
  it('mês, mês passado, ano e tudo', () => {
    const nov = new Date('2026-11-20T15:00:00Z');
    const out = new Date('2026-10-31T23:30:00-03:00');
    expect(inPeriod(nov, 'mes', TODAY)).toBeTrue();
    expect(inPeriod(out, 'mes', TODAY)).toBeFalse();
    expect(inPeriod(out, 'mes-passado', TODAY)).toBeTrue();
    expect(inPeriod(new Date('2026-01-10T12:00:00Z'), 'ano', TODAY)).toBeTrue();
    expect(inPeriod(new Date('2025-12-10T12:00:00Z'), 'ano', TODAY)).toBeFalse();
    expect(inPeriod(null, 'mes', TODAY)).toBeFalse();
    expect(inPeriod(null, 'tudo', TODAY)).toBeTrue();
  });

  it('virada de ano no mês passado', () => {
    expect(inPeriod(new Date('2025-12-15T12:00:00Z'), 'mes-passado', '2026-01-03')).toBeTrue();
  });

  it('meia-noite UTC de 1º de dezembro ainda é novembro em SP', () => {
    expect(inPeriod(new Date('2026-12-01T01:00:00Z'), 'mes', TODAY)).toBeTrue();
  });

  it('série de 6 meses termina no atual, ou no torneio futuro que já arrecadou', () => {
    const at = (iso: string, lines: LedgerLine[]) => ({ ...row(iso, lines), tournament: tournament(iso, new Date(iso)) });
    const series = monthSeries([at('2026-11-10T12:00:00Z', [line('1')]), at('2026-08-10T12:00:00Z', [line('2'), line('3')])], TODAY);
    expect(series.map((m) => m.key)).toEqual(['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11']);
    expect(series.map((m) => m.label)).toEqual(['jun', 'jul', 'ago', 'set', 'out', 'nov']);
    expect(series[2].netCents).toBe(2560);
    expect(series[5].current).toBeTrue();
    const ahead = monthSeries([at('2027-01-20T12:00:00Z', [line('1')])], TODAY);
    expect(ahead[ahead.length - 1].key).toBe('2027-01');
    expect(ahead.find((m) => m.current)?.key).toBe('2026-11');
  });
});

describe('arrecadação: pagamentos do torneio', () => {
  it('mais recente primeiro; comissão entra uma vez, na cobrança mais recente do par', () => {
    const old = line('a', { createdAt: new Date('2026-11-01T10:00:00Z'), registrationId: 'r1', payerUid: 'u1' });
    const redo = line('b', { createdAt: new Date('2026-11-02T10:00:00Z'), registrationId: 'r1', payerUid: 'u1', cashbackAppliedReais: 16 });
    const rows = paymentRows([old, redo], [{ tournamentId: 't', registrationId: 'r1', payerUid: 'u1', amountCents: 800 }]);
    expect(rows.map((p) => p.line.id)).toEqual(['b', 'a']);
    expect(rows[0].commissionCents).toBe(800);
    expect(rows[1].commissionCents).toBe(0);
    expect(rows[0].netCents).toBe(1280 - 1600 - 800);
    expect(costsLabel(rows[0])).toBe('Cashback − R$ 16,00 · Squad − R$ 8,00');
    expect(costsLabel(rows[1])).toBe('—');
  });

  it('CSV com ; e vírgula decimal; nome com ; vai entre aspas', () => {
    const rows = paymentRows([line('a', { createdAt: new Date('2026-11-05T17:32:00Z'), asaasPaymentId: 'pay_1' })], []);
    const csv = paymentsCsv(rows, () => 'Silva; Ana');
    const [head, first] = csv.split('\n');
    expect(head.split(';')[0]).toBe('Data');
    expect(first).toBe('05/11 14:32;"Silva; Ana";Pix;160,00;12,80;0,00;0,00;0,00;0,00;12,80;pay_1');
  });
});
