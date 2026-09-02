import { canRegeneratePix, registrationHoldNotice } from './registration-hold';

const NOW = new Date(2026, 8, 1, 14, 13); // 01/09/2026 14:13, hora local

describe('registrationHoldNotice', () => {
  it('inscrição sem prazo (antiga, do organizador ou em fila) não mostra nada', () => {
    expect(
      registrationHoldNotice({ holdExpiresAt: null, isPaid: false, hasLivePartnerInvite: false, now: NOW }),
    ).toBeNull();
  });

  it('com convite vivo o relógio some — quem manda ali é o convite', () => {
    expect(
      registrationHoldNotice({
        holdExpiresAt: new Date(NOW.getTime() + 48.5 * 3600_000),
        isPaid: false,
        hasLivePartnerInvite: true,
        now: NOW,
      }),
    ).toBeNull();
  });

  it('paga não tem prazo nenhum', () => {
    expect(
      registrationHoldNotice({
        holdExpiresAt: new Date(NOW.getTime() + 20 * 60_000),
        isPaid: true,
        hasLivePartnerInvite: false,
        now: NOW,
      }),
    ).toBeNull();
  });

  it('elenco fechado sem pagar mostra hora de parede e o que falta', () => {
    expect(
      registrationHoldNotice({
        holdExpiresAt: new Date(2026, 8, 1, 14, 35),
        isPaid: false,
        hasLivePartnerInvite: false,
        now: NOW,
      }),
    ).toBe('Vaga garantida até 14:35 · faltam 22 min');
  });

  it('prazo em outro dia carrega a data, senão 14:35 seria hoje', () => {
    expect(
      registrationHoldNotice({
        holdExpiresAt: new Date(2026, 8, 2, 14, 35),
        isPaid: false,
        hasLivePartnerInvite: false,
        now: NOW,
      }),
    ).toBe('Vaga garantida até 02/09 14:35 · falta 1 dia');
  });

  it('menos de um minuto não vira "faltam 0 min"', () => {
    expect(
      registrationHoldNotice({
        holdExpiresAt: new Date(NOW.getTime() + 30_000),
        isPaid: false,
        hasLivePartnerInvite: false,
        now: NOW,
      }),
    ).toBe('Vaga garantida até 14:13 · falta menos de 1 min');
  });

  it('vencido avisa que a vaga cai, em vez de contagem negativa', () => {
    expect(
      registrationHoldNotice({
        holdExpiresAt: new Date(NOW.getTime() - 60_000),
        isPaid: false,
        hasLivePartnerInvite: false,
        now: NOW,
      }),
    ).toBe('Prazo encerrado — sua vaga será liberada.');
  });

  it('prazo de horas usa hora, não 90 minutos', () => {
    expect(
      registrationHoldNotice({
        holdExpiresAt: new Date(NOW.getTime() + 2 * 3600_000),
        isPaid: false,
        hasLivePartnerInvite: false,
        now: NOW,
      }),
    ).toBe('Vaga garantida até 16:13 · faltam 2 horas');
  });
});

describe('canRegeneratePix', () => {
  const MIN = 60_000;

  it('inscrição sem prazo pode gerar quantos códigos quiser', () => {
    expect(canRegeneratePix({ holdExpiresAt: null, now: NOW })).toBe(true);
  });

  it('com prazo de sobra, pode gerar de novo', () => {
    expect(
      canRegeneratePix({ holdExpiresAt: new Date(NOW.getTime() + 20 * MIN), now: NOW }),
    ).toBe(true);
  });

  it('faltando menos que a janela mínima, não adianta oferecer novo código', () => {
    // O servidor recusaria: 4 min − 2 de margem = 2, abaixo do piso de 3.
    expect(
      canRegeneratePix({ holdExpiresAt: new Date(NOW.getTime() + 4 * MIN), now: NOW }),
    ).toBe(false);
  });

  it('prazo vencido não gera nada', () => {
    expect(
      canRegeneratePix({ holdExpiresAt: new Date(NOW.getTime() - MIN), now: NOW }),
    ).toBe(false);
  });

  it('na borda exata ainda oferece', () => {
    expect(
      canRegeneratePix({ holdExpiresAt: new Date(NOW.getTime() + 5 * MIN), now: NOW }),
    ).toBe(true);
  });
});
