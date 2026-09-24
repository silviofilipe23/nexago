import { parseAmountText, quoteKeyOf, validateManualBookingForm, type ManualBookingFormState } from './manual-booking-form';

const TODAY = '2026-09-24';

function stateOf(patch: Partial<ManualBookingFormState> = {}): ManualBookingFormState {
  return {
    courtId: 'court1',
    dateKey: TODAY,
    startTime: '19:00',
    endTime: '20:00',
    athleteId: null,
    customerName: 'João Silva',
    amountText: '120',
    note: '',
    ...patch,
  };
}

describe('parseAmountText', () => {
  it('lê vírgula e ponto como decimal', () => {
    expect(parseAmountText('120,50')).toBe(120.5);
    expect(parseAmountText('120.50')).toBe(120.5);
  });

  it('aceita zero', () => {
    expect(parseAmountText('0')).toBe(0);
  });

  it('devolve null pra vazio e pra texto', () => {
    expect(parseAmountText('')).toBeNull();
    expect(parseAmountText('   ')).toBeNull();
    expect(parseAmountText('abc')).toBeNull();
  });
});

describe('quoteKeyOf', () => {
  it('monta a chave quando quadra, data e intervalo estão válidos', () => {
    expect(quoteKeyOf(stateOf())).toBe('court1|2026-09-24|19:00|20:00');
  });

  it('devolve null com quadra ausente', () => {
    expect(quoteKeyOf(stateOf({ courtId: '' }))).toBeNull();
  });

  it('devolve null com intervalo inválido', () => {
    expect(quoteKeyOf(stateOf({ endTime: '19:00' }))).toBeNull();
  });

  it('aceita virada de meia-noite', () => {
    expect(quoteKeyOf(stateOf({ startTime: '23:00', endTime: '00:00' }))).toBe('court1|2026-09-24|23:00|00:00');
  });
});

describe('validateManualBookingForm', () => {
  it('monta o payload do cliente sem conta', () => {
    const result = validateManualBookingForm(stateOf(), 'arena1', TODAY);
    expect(result.ok).toBeTrue();
    if (!result.ok) return;
    expect(result.payload).toEqual({
      arenaId: 'arena1',
      courtId: 'court1',
      date: TODAY,
      startTime: '19:00',
      endTime: '20:00',
      customerName: 'João Silva',
      amountReais: 120,
    });
  });

  it('inclui athleteId e omite nome quando o atleta foi selecionado', () => {
    const result = validateManualBookingForm(
      stateOf({ athleteId: 'uid123', customerName: '' }),
      'arena1',
      TODAY,
    );
    expect(result.ok).toBeTrue();
    if (!result.ok) return;
    expect(result.payload.athleteId).toBe('uid123');
    expect(result.payload.customerName).toBeUndefined();
  });

  it('inclui a observação só quando preenchida', () => {
    const semNota = validateManualBookingForm(stateOf({ note: '  ' }), 'arena1', TODAY);
    expect(semNota.ok && semNota.payload.note).toBeUndefined();
    const comNota = validateManualBookingForm(stateOf({ note: ' pagou em dinheiro ' }), 'arena1', TODAY);
    expect(comNota.ok && comNota.payload.note).toBe('pagou em dinheiro');
  });

  it('cobra a quadra', () => {
    const result = validateManualBookingForm(stateOf({ courtId: '' }), 'arena1', TODAY);
    expect(result).toEqual({ ok: false, error: 'Escolha a quadra.' });
  });

  it('cobra atleta ou nome do cliente', () => {
    const result = validateManualBookingForm(stateOf({ customerName: '  ', athleteId: null }), 'arena1', TODAY);
    expect(result).toEqual({ ok: false, error: 'Informe o atleta ou o nome do cliente.' });
  });

  it('cobra intervalo válido', () => {
    const result = validateManualBookingForm(stateOf({ endTime: '18:00' }), 'arena1', TODAY);
    expect(result).toEqual({ ok: false, error: 'O horário de fim precisa ser depois do início.' });
  });

  it('cobra valor numérico e aceita zero', () => {
    expect(validateManualBookingForm(stateOf({ amountText: 'abc' }), 'arena1', TODAY)).toEqual({
      ok: false,
      error: 'Informe um valor válido.',
    });
    expect(validateManualBookingForm(stateOf({ amountText: '-1' }), 'arena1', TODAY)).toEqual({
      ok: false,
      error: 'Informe um valor válido.',
    });
    const cortesia = validateManualBookingForm(stateOf({ amountText: '0' }), 'arena1', TODAY);
    expect(cortesia.ok && cortesia.payload.amountReais).toBe(0);
  });

  it('recusa dia passado e aceita hoje', () => {
    expect(validateManualBookingForm(stateOf({ dateKey: '2026-09-23' }), 'arena1', TODAY)).toEqual({
      ok: false,
      error: 'Não dá pra criar reserva em data passada.',
    });
    expect(validateManualBookingForm(stateOf(), 'arena1', TODAY).ok).toBeTrue();
  });
});
