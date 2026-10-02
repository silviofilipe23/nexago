import {
  DEFAULT_CASHBACK_CONFIG,
  EMPTY_CASHBACK_WALLET,
  MINUS_SIGN,
  cashbackEntryVisible,
  cashbackLedgerEntryFromData,
  cashbackLedgerRow,
  cashbackLotFromData,
  cashbackWalletFromData,
  formatCentsBRL,
  formatRatePercent,
  formatShortDate,
  groupLedgerByMonth,
  parseCashbackConfig,
  reaisToCents,
  type CashbackLedgerEntry,
  type CashbackLedgerType,
} from './cashback-model';

/** Timestamp do Firestore como o cliente o vê: só o `toDate()` importa. */
function ts(d: Date): { toDate: () => Date } {
  return { toDate: () => d };
}

function entry(overrides: Partial<CashbackLedgerEntry> = {}): CashbackLedgerEntry {
  return {
    id: 'l1',
    type: 'earn',
    amountCents: 240,
    label: 'Reserva · Arena Sol · 12/10',
    createdAt: new Date(2026, 9, 12, 19, 0),
    ...overrides,
  };
}

describe('parseCashbackConfig', () => {
  it('doc ausente cai no padrão, desligado', () => {
    expect(parseCashbackConfig(undefined)).toEqual(DEFAULT_CASHBACK_CONFIG);
    expect(DEFAULT_CASHBACK_CONFIG.enabled).toBeFalse();
  });

  it('lê os campos válidos e converte o mínimo para centavos', () => {
    expect(
      parseCashbackConfig({
        enabled: true,
        ratePercent: 3,
        maxShareOfFee: 0.4,
        minCashReais: 7.5,
        expiryMonths: 12,
        expiryWarningDays: 10,
      }),
    ).toEqual({
      enabled: true,
      ratePercent: 3,
      maxShareOfFee: 0.4,
      minCashCents: 750,
      expiryMonths: 12,
      expiryWarningDays: 10,
    });
  });

  it('campo fora da faixa ou de outro tipo volta ao padrão — igual ao backend', () => {
    expect(
      parseCashbackConfig({
        enabled: 'true',
        ratePercent: 50,
        maxShareOfFee: '0.5',
        minCashReais: -1,
        expiryMonths: 0,
        expiryWarningDays: Number.NaN,
      }),
    ).toEqual(DEFAULT_CASHBACK_CONFIG);
  });
});

describe('reaisToCents', () => {
  it('arredonda para o centavo mais próximo — nunca trunca o erro do float', () => {
    expect(reaisToCents(19.99)).toBe(1999);
    expect(reaisToCents(0.1 + 0.2)).toBe(30);
    expect(reaisToCents(100 / 3)).toBe(3333);
    expect(reaisToCents(Number.NaN)).toBe(0);
  });
});

describe('cashbackWalletFromData', () => {
  it('doc ausente é carteira zerada', () => {
    expect(cashbackWalletFromData(undefined)).toEqual(EMPTY_CASHBACK_WALLET);
  });

  it('lê os totais e o próximo vencimento', () => {
    const expiry = new Date(2027, 2, 12);
    const wallet = cashbackWalletFromData({
      availableCents: 1240,
      pendingCents: 240,
      heldCents: 0,
      lifetimeEarnedCents: 2000,
      lifetimeRedeemedCents: 520,
      nextExpiryAt: ts(expiry),
      nextExpiryCents: 320,
    });
    expect(wallet.availableCents).toBe(1240);
    expect(wallet.pendingCents).toBe(240);
    expect(wallet.lifetimeRedeemedCents).toBe(520);
    expect(wallet.nextExpiryAt).toEqual(expiry);
    expect(wallet.nextExpiryCents).toBe(320);
  });

  it('valor negativo, texto ou NaN conta como zero', () => {
    const wallet = cashbackWalletFromData({
      availableCents: -50,
      pendingCents: '240',
      heldCents: Number.NaN,
      nextExpiryAt: 'amanhã',
    });
    expect(wallet.availableCents).toBe(0);
    expect(wallet.pendingCents).toBe(0);
    expect(wallet.heldCents).toBe(0);
    expect(wallet.nextExpiryAt).toBeNull();
  });
});

describe('cashbackLedgerEntryFromData', () => {
  it('lê tipo, valor, rótulo e data', () => {
    const at = new Date(2026, 9, 12, 19, 0);
    expect(
      cashbackLedgerEntryFromData('l1', {
        type: 'redeem',
        amountCents: 1500,
        label: ' Inscrição · Copa VH ',
        createdAt: ts(at),
      }),
    ).toEqual({ id: 'l1', type: 'redeem', amountCents: 1500, label: 'Inscrição · Copa VH', createdAt: at });
  });

  it('tipo desconhecido, valor zerado ou sem data fica de fora em vez de quebrar a página', () => {
    const at = ts(new Date(2026, 9, 12));
    expect(cashbackLedgerEntryFromData('a', { type: 'bonus', amountCents: 100, createdAt: at })).toBeNull();
    expect(cashbackLedgerEntryFromData('b', { type: 'earn', amountCents: 0, createdAt: at })).toBeNull();
    expect(cashbackLedgerEntryFromData('c', { type: 'earn', amountCents: 100, createdAt: null })).toBeNull();
    expect(cashbackLedgerEntryFromData('d', undefined)).toBeNull();
  });
});

describe('cashbackLotFromData', () => {
  it('lê status e valor ganho do lote', () => {
    expect(
      cashbackLotFromData('pay_1', { status: 'pending', earnedCents: 240, remainingCents: 240, label: 'Reserva' }),
    ).toEqual({ id: 'pay_1', status: 'pending', earnedCents: 240, remainingCents: 240, label: 'Reserva' });
  });

  it('status desconhecido é null', () => {
    expect(cashbackLotFromData('pay_1', { status: 'weird', earnedCents: 240 })).toBeNull();
  });
});

describe('cashbackEntryVisible', () => {
  const on = { ...DEFAULT_CASHBACK_CONFIG, enabled: true };

  it('aparece com o recurso ligado e saldo disponível ou pendente', () => {
    expect(cashbackEntryVisible(on, { ...EMPTY_CASHBACK_WALLET, pendingCents: 240 })).toBeTrue();
    expect(cashbackEntryVisible(on, { ...EMPTY_CASHBACK_WALLET, availableCents: 1 })).toBeTrue();
  });

  it('some com o recurso desligado ou sem saldo (reservado sozinho não conta)', () => {
    expect(cashbackEntryVisible(DEFAULT_CASHBACK_CONFIG, { ...EMPTY_CASHBACK_WALLET, availableCents: 1240 })).toBeFalse();
    expect(cashbackEntryVisible(on, { ...EMPTY_CASHBACK_WALLET, heldCents: 500 })).toBeFalse();
  });
});

describe('formatação', () => {
  it('BRL com centavos e espaço comum', () => {
    expect(formatCentsBRL(240)).toBe('R$ 2,40');
    expect(formatCentsBRL(123456)).toBe('R$ 1.234,56');
    expect(formatCentsBRL(0)).toBe('R$ 0,00');
  });

  it('porcentagem com vírgula', () => {
    expect(formatRatePercent(2)).toBe('2');
    expect(formatRatePercent(2.5)).toBe('2,5');
  });

  it('data curta dd/mm', () => {
    expect(formatShortDate(new Date(2026, 2, 5))).toBe('05/03');
  });
});

describe('cashbackLedgerRow', () => {
  it('ganho: + amarelo com sufixo "pendente"', () => {
    const row = cashbackLedgerRow(entry({ type: 'earn', amountCents: 240 }));
    expect(row.title).toBe('Cashback ganho');
    expect(row.amountLabel).toBe('+R$ 2,40');
    expect(row.tone).toBe('pending');
    expect(row.suffix).toBe('pendente');
    expect(row.subtitle).toBe('Reserva · Arena Sol · 12/10');
    expect(row.dateLabel).toBe('12/10');
  });

  it('cada tipo com o título, o sinal e o tom do brief', () => {
    const cases: Array<[CashbackLedgerType, string, string, string]> = [
      ['release', 'Cashback liberado', '+R$ 2,40', 'win'],
      ['cancel', 'Cashback cancelado', `${MINUS_SIGN}R$ 2,40`, 'muted'],
      ['redeem', 'Usado no pagamento', `${MINUS_SIGN}R$ 2,40`, 'brand'],
      ['expire', 'Venceu', `${MINUS_SIGN}R$ 2,40`, 'muted'],
      ['reverse', 'Estornado', `${MINUS_SIGN}R$ 2,40`, 'muted'],
      ['refund', 'Devolvido ao saldo', '+R$ 2,40', 'win'],
    ];
    for (const [type, title, amount, tone] of cases) {
      const row = cashbackLedgerRow(entry({ type }));
      expect(row.title).withContext(type).toBe(title);
      expect(row.amountLabel).withContext(type).toBe(amount);
      expect(row.tone).withContext(type).toBe(tone);
      expect(row.suffix).withContext(type).toBeNull();
    }
    expect(cashbackLedgerRow(entry({ type: 'cancel' })).struck).toBeTrue();
    expect(cashbackLedgerRow(entry({ type: 'redeem' })).struck).toBeFalse();
  });
});

describe('groupLedgerByMonth', () => {
  it('agrupa pelo mês do navegador mantendo a ordem do extrato (virada do mês incluída)', () => {
    const months = groupLedgerByMonth([
      entry({ id: 'a', createdAt: new Date(2026, 10, 2, 10, 0) }),
      entry({ id: 'b', createdAt: new Date(2026, 9, 31, 23, 30) }),
      entry({ id: 'c', createdAt: new Date(2026, 9, 1, 0, 5) }),
    ]);
    expect(months.map((m) => m.title)).toEqual(['novembro de 2026', 'outubro de 2026']);
    expect(months.map((m) => m.key)).toEqual(['2026-11', '2026-10']);
    expect(months[1]!.rows.map((r) => r.id)).toEqual(['b', 'c']);
  });

  it('extrato vazio não tem meses', () => {
    expect(groupLedgerByMonth([])).toEqual([]);
  });
});
