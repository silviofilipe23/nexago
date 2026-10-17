import { registrationChargePayload } from './tournament-registrations-repository';

describe('registrationChargePayload', () => {
  it('manda useCashback só quando o toggle está ligado', () => {
    expect(
      registrationChargePayload({ registrationId: 'r1', amountType: 'full', cpfCnpj: '12345678909', useCashback: true }),
    ).toEqual({ registrationId: 'r1', amountType: 'full', cpfCnpj: '12345678909', useCashback: true });
  });

  it('sem o toggle o corpo é exatamente o de antes', () => {
    expect(registrationChargePayload({ registrationId: 'r1', amountType: 'share', cpfCnpj: '12345678909' })).toEqual({
      registrationId: 'r1',
      amountType: 'share',
      cpfCnpj: '12345678909',
    });
    expect(
      'useCashback' in
        registrationChargePayload({ registrationId: 'r1', amountType: 'share', cpfCnpj: '1', useCashback: false }),
    ).toBeFalse();
  });

  it('manda o código de embaixador aparado, e nada quando vazio', () => {
    expect(
      registrationChargePayload({ registrationId: 'r1', amountType: 'share', cpfCnpj: '1', squadCode: ' JOAO10 ' }),
    ).toEqual({ registrationId: 'r1', amountType: 'share', cpfCnpj: '1', squadCode: 'JOAO10' });
    expect(
      'squadCode' in registrationChargePayload({ registrationId: 'r1', amountType: 'share', cpfCnpj: '1', squadCode: '  ' }),
    ).toBeFalse();
  });
});
