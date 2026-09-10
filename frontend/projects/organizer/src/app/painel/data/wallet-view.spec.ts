import { shouldExplainZeroBalance, tournamentsOfWallet } from './wallet-view';
import type { OrganizerTournament } from './tournament.model';

function tournament(id: string, managerId: string): OrganizerTournament {
  return { id, managerId } as OrganizerTournament;
}

describe('tournamentsOfWallet', () => {
  const lista = [tournament('t1', 'dono'), tournament('t2', 'gestor'), tournament('t3', 'dono')];

  it('fica só com os torneios do dono da carteira em exibição', () => {
    expect(tournamentsOfWallet(lista, 'dono').map((t) => t.id)).toEqual(['t1', 't3']);
  });

  it('carteira própria do gestor traz só os torneios dele', () => {
    expect(tournamentsOfWallet(lista, 'gestor').map((t) => t.id)).toEqual(['t2']);
  });

  it('sem carteira carregada não filtra nada', () => {
    expect(tournamentsOfWallet(lista, '')).toEqual(lista);
  });
});

describe('shouldExplainZeroBalance', () => {
  it('explica quando tudo foi recebido direto com o organizador', () => {
    expect(
      shouldExplainZeroBalance({
        availableReais: 0,
        pendingReais: 0,
        ledgerCount: 0,
        viaOrganizerCents: 529000,
      }),
    ).toBe(true);
  });

  it('não explica quando o zero é "já sacou tudo"', () => {
    expect(
      shouldExplainZeroBalance({
        availableReais: 0,
        pendingReais: 0,
        ledgerCount: 46,
        viaOrganizerCents: 20690,
      }),
    ).toBe(false);
  });

  it('não explica com saldo disponível', () => {
    expect(
      shouldExplainZeroBalance({
        availableReais: 10,
        pendingReais: 0,
        ledgerCount: 0,
        viaOrganizerCents: 529000,
      }),
    ).toBe(false);
  });

  it('não explica com valor só reservado em saque pendente', () => {
    expect(
      shouldExplainZeroBalance({
        availableReais: 0,
        pendingReais: 61,
        ledgerCount: 0,
        viaOrganizerCents: 529000,
      }),
    ).toBe(false);
  });

  it('carteira zerada sem arrecadação nenhuma não inventa explicação', () => {
    expect(
      shouldExplainZeroBalance({
        availableReais: 0,
        pendingReais: 0,
        ledgerCount: 0,
        viaOrganizerCents: 0,
      }),
    ).toBe(false);
  });
});
