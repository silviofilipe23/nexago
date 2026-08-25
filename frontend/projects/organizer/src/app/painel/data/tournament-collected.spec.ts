import { collectedFromDoc, formatCentsShort, sumCollected } from './tournament-collected';

describe('collectedFromDoc', () => {
  it('lê o recorte gravado pela Cloud Function', () => {
    const c = collectedFromDoc(
      {
        collectedCents: 30000,
        collectedViaAppCents: 20000,
        collectedViaOrganizerCents: 10000,
        collectedToVerifyCents: 4000,
      },
      'appPixCard',
    );
    expect(c.viaAppCents).toBe(20000);
    expect(c.viaOrganizerCents).toBe(10000);
    expect(c.toVerifyCents).toBe(4000);
    expect(c.totalCents).toBe(30000);
    expect(c.estimated).toBe(false);
  });

  it('soma os canais em vez de confiar no total gravado', () => {
    // Escrita parcial: `collectedCents` ficou velho. Os dois valores exibidos têm que fechar
    // com o total mostrado, senão a tela se contradiz.
    const c = collectedFromDoc(
      { collectedCents: 999, collectedViaAppCents: 20000, collectedViaOrganizerCents: 10000 },
      'appPixCard',
    );
    expect(c.totalCents).toBe(30000);
  });

  it('cai no paymentMode quando o doc é anterior ao recorte', () => {
    const app = collectedFromDoc({ collectedCents: 15000 }, 'appPixCard');
    expect(app.viaAppCents).toBe(15000);
    expect(app.viaOrganizerCents).toBe(0);
    expect(app.estimated).toBe(true);

    const direto = collectedFromDoc({ collectedCents: 15000 }, 'directWithOrganizer');
    expect(direto.viaOrganizerCents).toBe(15000);
    expect(direto.viaAppCents).toBe(0);
    expect(direto.estimated).toBe(true);
  });

  it('trata campo ausente como diferente de zero', () => {
    // Torneio SEM arrecadação mas COM o recorte gravado não é estimado — senão um torneio
    // zerado ficaria marcado como suposto pra sempre.
    const real = collectedFromDoc(
      { collectedCents: 0, collectedViaAppCents: 0, collectedViaOrganizerCents: 0 },
      'appPixCard',
    );
    expect(real.estimated).toBe(false);

    const semCampos = collectedFromDoc({}, 'appPixCard');
    expect(semCampos.estimated).toBe(true);
    expect(semCampos.totalCents).toBe(0);
  });

  it('limita "a conferir" ao que entrou por fora', () => {
    const c = collectedFromDoc(
      { collectedViaAppCents: 0, collectedViaOrganizerCents: 5000, collectedToVerifyCents: 90000 },
      'appPixCard',
    );
    expect(c.toVerifyCents).toBe(5000);
  });

  it('ignora lixo e valores negativos', () => {
    const c = collectedFromDoc(
      { collectedViaAppCents: -500, collectedViaOrganizerCents: 'x', collectedCents: 100 },
      'directWithOrganizer',
    );
    // `collectedViaOrganizerCents` inválido derruba tudo pro fallback.
    expect(c.estimated).toBe(true);
    expect(c.viaOrganizerCents).toBe(100);
  });
});

describe('sumCollected', () => {
  it('soma os canais e propaga o estimado', () => {
    const total = sumCollected([
      collectedFromDoc({ collectedViaAppCents: 10000, collectedViaOrganizerCents: 5000 }, 'appPixCard'),
      collectedFromDoc({ collectedCents: 2000 }, 'directWithOrganizer'),
    ]);
    expect(total.viaAppCents).toBe(10000);
    expect(total.viaOrganizerCents).toBe(7000);
    expect(total.totalCents).toBe(17000);
    expect(total.estimated).toBe(true);
  });

  it('lista vazia é zero e não estimada', () => {
    const total = sumCollected([]);
    expect(total.totalCents).toBe(0);
    expect(total.estimated).toBe(false);
  });
});

describe('formatCentsShort', () => {
  it('mostra valor redondo', () => {
    expect(formatCentsShort(150000).replace(/ /g, ' ')).toBe('R$ 1.500');
  });
});
