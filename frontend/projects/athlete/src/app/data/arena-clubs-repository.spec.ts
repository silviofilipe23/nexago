import { clubJoinPayload } from './arena-clubs-repository';

describe('clubJoinPayload', () => {
  it('manda useCashback só quando o toggle está ligado', () => {
    expect(clubJoinPayload({ sessionId: 's1', cpfCnpj: '12345678909', useCashback: true })).toEqual({
      sessionId: 's1',
      cpfCnpj: '12345678909',
      useCashback: true,
    });
  });

  it('sem o toggle o corpo é o de antes — CPF vazio continua indo como undefined', () => {
    const payload = clubJoinPayload({ sessionId: 's1', cpfCnpj: '' });
    expect(payload).toEqual({ sessionId: 's1', cpfCnpj: undefined });
    expect('useCashback' in payload).toBeFalse();
    expect('squadCode' in payload).toBeFalse();
  });

  it('manda o código de embaixador quando há um', () => {
    expect(clubJoinPayload({ sessionId: 's1', squadCode: 'JOAO10' })).toEqual({
      sessionId: 's1',
      cpfCnpj: undefined,
      squadCode: 'JOAO10',
    });
  });
});
