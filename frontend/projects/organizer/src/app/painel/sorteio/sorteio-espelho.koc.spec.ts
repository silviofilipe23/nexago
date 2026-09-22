import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { DrawSession, DrawSessionEntrant } from '../data/draw-session.model';
import { SorteioEspelhoComponent } from './sorteio-espelho.component';

/**
 * O espelho é o que o organizador olha ENQUANTO conduz — o telão está na outra
 * tela, de costas pra ele. Numa sessão de King of the Court ele perguntava por
 * `format === 'groups_knockout'` e caía no desenho da dupla eliminatória, que
 * lê `bracketOutline`: a KOTC não tem nenhum, então o painel central ficava
 * vazio no meio da transmissão.
 *
 * O teste renderiza a KOTC de verdade e cobra as RODADAS, não grupos.
 */

function entrant(teamId: string, potIndex: number): DrawSessionEntrant {
  return {
    teamId,
    label: `DUPLA ${teamId.toUpperCase()}`,
    playerNames: [],
    photoUrls: [],
    city: null,
    levelLabel: 'Open + Open',
    points: 10,
    rating: null,
    potIndex,
    lockedSeed: null,
    stats: { wins: 0, losses: 0, titles: 0, last5: [] },
  };
}

function kocSession(): DrawSession {
  const teamIds = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  return {
    id: 's1',
    tournamentId: 't1',
    categoryId: 'c1',
    tournamentName: 'Liga nexaGO',
    categoryName: 'Mista Open',
    sportCode: 'BEACH_TENNIS',
    format: 'king_of_court',
    status: 'live',
    scheduledAt: null,
    startedAt: 1000,
    publishedAt: null,
    voidedAt: null,
    voidReason: null,
    config: {
      mode: 'manual',
      intervalMs: 6000,
      phrasesEnabled: true,
      lockedSeedCount: 0,
      teamsPerGroup: 4,
      qualifiersPerGroup: 2,
      constraints: { seedsApart: true, potsPerGroup: true, avoidSameCity: false },
    },
    pots: [
      { index: 1, teamIds: ['a', 'b'] },
      { index: 2, teamIds: ['c', 'd'] },
      { index: 3, teamIds: ['e', 'f'] },
      { index: 4, teamIds: ['g', 'h'] },
    ],
    entrants: teamIds.map((id, i) => entrant(id, Math.floor(i / 2) + 1)),
    reveals: [
      {
        index: 1,
        teamId: 'a',
        destinationKey: 'grupo:A',
        atMillis: 1000,
        prevHash: 'g',
        hash: 'h1',
        destination: { type: 'group', groupId: 'A' },
        relaxed: [],
        phrase: null,
        dePlacement: null,
      },
    ],
    genesisHash: 'g',
    totalReveals: 8,
    bracketOutline: null,
  } as DrawSession;
}

async function render(session: DrawSession): Promise<HTMLElement> {
  await TestBed.configureTestingModule({
    imports: [SorteioEspelhoComponent],
    providers: [provideZonelessChangeDetection()],
  }).compileComponents();

  const fixture = TestBed.createComponent(SorteioEspelhoComponent);
  fixture.componentRef.setInput('session', session);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

describe('SorteioEspelhoComponent · King of the Court', () => {
  it('desenha a grade de caixas, não a planta da dupla eliminatória', async () => {
    const host = await render(kocSession());
    expect(host.querySelector('.og-esp-grade')).not.toBeNull();
    expect(host.querySelector('.og-esp-de')).toBeNull();
  });

  it('chama cada caixa de RODADA e abre uma por quadra do campo', async () => {
    const host = await render(kocSession());
    const nomes = [...host.querySelectorAll('.og-esp-nome')].map((el) => el.textContent?.trim());
    expect(nomes).toEqual(['Rodada 1', 'Rodada 2']);
  });

  it('a dupla já revelada aparece na rodada dela', async () => {
    const host = await render(kocSession());
    const primeira = host.querySelector('.og-esp-grupo');
    expect(primeira?.textContent).toContain('DUPLA A');
  });

  it('em fase de grupos o mesmo espelho continua falando em grupo', async () => {
    const host = await render({ ...kocSession(), format: 'groups_knockout' });
    const nomes = [...host.querySelectorAll('.og-esp-nome')].map((el) => el.textContent?.trim());
    expect(nomes).toEqual(['Grupo A', 'Grupo B']);
  });
});
