import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { DrawSession, DrawSessionEntrant } from '../data/draw-session.model';
import type { OrganizerTournament, OrganizerTournamentCategory } from '../data/tournament.model';
import { SorteioConfigComponent } from './sorteio-config.component';

/**
 * King of the Court é ESCOLHA do organizador no card de criação da sessão.
 *
 * Antes a KOTC só aparecia quando a categoria já estava salva como King of the
 * Court — quem quisesse transmitir uma categoria de grupos em formato KOTC não
 * tinha por onde. Agora a categoria salva como KOTC continua TRAVADA (sortear
 * como grupo geraria uma chave que o formato não tem), e qualquer outra
 * oferece os três formatos.
 */

function category(id: string, bracketFormat: string | null): OrganizerTournamentCategory {
  return { id, name: 'Mista Open', bracketFormat } as OrganizerTournamentCategory;
}

function tournament(categories: OrganizerTournamentCategory[]): OrganizerTournament {
  return { id: 't1', name: 'Liga nexaGO', categories } as OrganizerTournament;
}

function entrant(teamId: string, potIndex: number): DrawSessionEntrant {
  return {
    teamId,
    label: teamId,
    playerNames: [],
    photoUrls: [],
    city: null,
    levelLabel: '',
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
    status: 'draft',
    scheduledAt: null,
    startedAt: null,
    publishedAt: null,
    voidedAt: null,
    voidReason: null,
    config: {
      mode: 'hybrid',
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
    reveals: [],
    genesisHash: 'g',
    totalReveals: 8,
    bracketOutline: null,
  } as DrawSession;
}

describe('SorteioConfigComponent · formato da sessão', () => {
  let fixture: ComponentFixture<SorteioConfigComponent>;

  beforeEach(async () => {
    // Portal zoneless: sem o provider o TestBed falha com NG0908.
    await TestBed.configureTestingModule({
      imports: [SorteioConfigComponent],
      providers: [provideZonelessChangeDetection(), provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(SorteioConfigComponent);
  });

  /** `id` vazio de propósito: o efeito de carga sai na primeira linha e a tela
   *  não toca o Firestore — o estado entra na mão, como no resto do painel. */
  async function open(bracketFormat: string | null): Promise<void> {
    fixture.componentRef.setInput('id', '');
    fixture.componentRef.setInput('catId', 'c1');
    fixture.detectChanges();
    fixture.componentInstance['tournament'].set(tournament([category('c1', bracketFormat)]));
    fixture.componentInstance['loading'].set(false);
    fixture.detectChanges();
    await fixture.whenStable();
  }

  function rows(): HTMLElement[] {
    return Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.og-sc-formatos og-radio-row'),
    );
  }

  function titles(): string[] {
    return rows().map((row) => row.querySelector('.og-radio-title')?.textContent?.trim() ?? '');
  }

  function selectedTitle(): string | undefined {
    return titles().find((_, i) => rows()[i]!.classList.contains('selected'));
  }

  it('categoria de grupos oferece King of the Court como terceira opção', async () => {
    await open('groups_knockout');

    expect(titles()).toEqual(['Fase de grupos', 'Dupla eliminatória', 'King of the Court']);
  });

  it('escolher King of the Court marca a linha', async () => {
    await open('groups_knockout');

    rows()[2]!.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(selectedTitle()).toBe('King of the Court');
  });

  it('o formato escolhido é o que a sessão vai ser criada', async () => {
    await open('groups_knockout');
    expect(fixture.componentInstance['chosenFormat']()).toBe('groups_knockout');

    rows()[2]!.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.componentInstance['chosenFormat']()).toBe('king_of_court');
  });

  it('categoria travada cria a sessão em King of the Court mesmo sem clique', async () => {
    await open('king_of_court');

    expect(fixture.componentInstance['chosenFormat']()).toBe('king_of_court');
  });

  it('categoria King of the Court fica travada no formato, sem grupos nem dupla eliminatória', async () => {
    await open('king_of_court');

    expect(titles()).toEqual(['King of the Court']);
    expect(selectedTitle()).toBe('King of the Court');
  });

  it('aceita o apelido `kingOfCourt` gravado pelo app — a trava não depende da grafia', async () => {
    await open('kingOfCourt');

    expect(titles()).toEqual(['King of the Court']);
  });

  it('sessão King of the Court mede rodadas, não grupos', async () => {
    await open('king_of_court');
    fixture.componentInstance['session'].set(kocSession());
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.componentInstance['formatStats']().map((s) => s.label)).toEqual([
      'duplas',
      'rodadas',
      'por rodada',
    ]);
  });

  it('o aviso de divisão exata da sessão KOTC fala de rodada, não de grupo', async () => {
    await open('king_of_court');
    fixture.componentInstance['session'].set(kocSession());
    fixture.detectChanges();
    await fixture.whenStable();

    const nota = fixture.componentInstance['exactNote']();
    expect(nota).toContain('rodada');
    expect(nota).not.toContain('grupo');
  });
});
