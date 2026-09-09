import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import type { DrawSession, DrawSessionEntrant, DrawSessionReveal } from '../data/draw-session.model';
import { DrawClockService } from './draw-clock.service';
import { DrawSessionStore } from './draw-session.store';
import { SorteioConsoleComponent } from './sorteio-console.component';

/**
 * O console é a única superfície com botões, e o risco dele está nos estados
 * desses botões: publicar antes da hora publicaria chave incompleta, e sortear
 * numa sessão anulada seria pior ainda. É isso que estes testes travam.
 */

function entrant(teamId: string, over: Partial<DrawSessionEntrant> = {}): DrawSessionEntrant {
  return {
    teamId,
    label: `DUPLA-${teamId.toUpperCase()}`,
    playerNames: [],
    photoUrls: [],
    city: null,
    levelLabel: 'Open + Open',
    points: 12,
    rating: null,
    potIndex: 1,
    lockedSeed: null,
    stats: { wins: 3, losses: 1, titles: 1, last5: ['V', 'D'] },
    ...over,
  };
}

function reveal(index: number, teamId: string, groupId: string): DrawSessionReveal {
  return {
    index,
    teamId,
    destinationKey: `grupo:${groupId}`,
    atMillis: 1_000 * index,
    prevHash: 'p',
    hash: 'h',
    destination: { type: 'group', groupId },
    relaxed: [],
    phrase: { id: 'gen-1', text: 'Mais uma vaga preenchida.' },
    dePlacement: null,
  };
}

function session(over: Partial<DrawSession> = {}): DrawSession {
  return {
    id: 's1',
    tournamentId: 't1',
    categoryId: 'c1',
    tournamentName: 'Copa Verão',
    categoryName: 'Feminino Open',
    sportCode: 'BEACH_TENNIS',
    format: 'groups_knockout',
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
      teamsPerGroup: 2,
      qualifiersPerGroup: 1,
      constraints: { seedsApart: false, potsPerGroup: true, avoidSameCity: false },
    },
    pots: [
      { index: 1, teamIds: ['a', 'b'] },
      { index: 2, teamIds: ['c', 'd'] },
    ],
    entrants: [entrant('a'), entrant('b'), entrant('c'), entrant('d')],
    reveals: [],
    genesisHash: 'g',
    totalReveals: 4,
    bracketOutline: null,
    ...over,
  };
}

async function render(current: DrawSession | null) {
  const store = {
    sessionId: signal<string | null>('s1'),
    session: signal(current),
    loading: signal(false),
    notFound: signal(false),
    error: signal(false),
  };

  await TestBed.configureTestingModule({
    imports: [SorteioConsoleComponent],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { queryParamMap: new Map([['s', 's1']]) } },
      },
    ],
  })
    .overrideComponent(SorteioConsoleComponent, {
      set: {
        providers: [
          { provide: DrawSessionStore, useValue: store as unknown as DrawSessionStore },
          DrawClockService,
        ],
      },
    })
    .compileComponents();

  const fixture = TestBed.createComponent(SorteioConsoleComponent);
  await fixture.whenStable();
  return fixture;
}

/** Botão pelo texto visível — é como o organizador o encontra na tela. */
function buttonByText(fixture: Awaited<ReturnType<typeof render>>, text: string): HTMLButtonElement {
  const el = (fixture.nativeElement as HTMLElement).querySelectorAll('button');
  const found = [...el].find((b) => (b.textContent ?? '').trim().includes(text));
  if (!found) throw new Error(`botão "${text}" não está na tela`);
  return found as HTMLButtonElement;
}

describe('SorteioConsoleComponent', () => {
  it('sem sessão, avisa em vez de mostrar controles', async () => {
    const fixture = await render(null);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Sessão não encontrada');
  });

  it('com sessão no ar, oferece "Sortear próxima" habilitado', async () => {
    const fixture = await render(session());
    expect(buttonByText(fixture, 'Sortear próxima').disabled).toBe(false);
  });

  it('NÃO deixa publicar com o sorteio incompleto', async () => {
    const fixture = await render(session({ reveals: [reveal(1, 'a', 'A')] }));
    expect(buttonByText(fixture, 'Publicar chave').disabled).toBe(true);
  });

  it('libera publicar quando todas as revelações saíram', async () => {
    const reveals = ['a', 'b', 'c', 'd'].map((t, i) => reveal(i + 1, t, i % 2 ? 'B' : 'A'));
    const fixture = await render(session({ reveals }));
    expect(buttonByText(fixture, 'Publicar chave').disabled).toBe(false);
    expect(buttonByText(fixture, 'Sorteio completo').disabled).toBe(true);
  });

  it('sessão anulada trava sortear, publicar e anular de novo', async () => {
    const fixture = await render(session({ status: 'voided', voidReason: 'lista errada' }));
    expect(buttonByText(fixture, 'Sortear próxima').disabled).toBe(true);
    expect(buttonByText(fixture, 'Publicar chave').disabled).toBe(true);
    expect(buttonByText(fixture, 'Anular sessão').disabled).toBe(true);
  });

  it('modo manual não mostra o botão de automático', async () => {
    const fixture = await render(session());
    expect(() => buttonByText(fixture, 'automático')).toThrow();
  });

  it('modo híbrido mostra pausar/retomar automático', async () => {
    const fixture = await render(session({ config: { ...session().config, mode: 'hybrid' } }));
    expect(buttonByText(fixture, 'Pausar automático')).toBeTruthy();
  });

  it('a fila lista só quem ainda não saiu — quem já foi sorteada some dela', async () => {
    const fixture = await render(session({ reveals: [reveal(1, 'a', 'A')] }));
    const nomes = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll('.og-cs-fila .og-dupla-nome'),
    ].map((el) => (el.textContent ?? '').trim());
    expect(nomes).toEqual(['DUPLA-B', 'DUPLA-C', 'DUPLA-D']);
  });

  it('com frases desligadas, não oferece trocar frase', async () => {
    const fixture = await render(
      session({
        reveals: [reveal(1, 'a', 'A')],
        config: { ...session().config, phrasesEnabled: false },
      }),
    );
    expect(() => buttonByText(fixture, 'Trocar')).toThrow();
  });

  it('o log aparece do mais recente para o mais antigo', async () => {
    const reveals = ['a', 'b'].map((t, i) => reveal(i + 1, t, 'A'));
    const fixture = await render(session({ reveals }));
    const items = (fixture.nativeElement as HTMLElement).querySelectorAll('.og-cs-log li');
    expect(items[0].textContent).toContain('#02');
  });
});
