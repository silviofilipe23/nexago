import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { OverlayKocTeam } from './overlay-koc-bar.component';
import type { KocQualifiedBoard } from './overlay-koc-qualified';
import { OverlayKocQualifiedComponent } from './overlay-koc-qualified.component';

function board(overrides: Partial<KocQualifiedBoard> = {}): KocQualifiedBoard {
  return {
    entries: [
      { teamId: 'e', place: 1, roundLabel: 1 },
      { teamId: 'd', place: 1, roundLabel: 2 },
      { teamId: 'a', place: 1, roundLabel: 3 },
      { teamId: 'b', place: 1, roundLabel: 4 },
    ],
    totalRounds: 7,
    roundsDone: 4,
    vagasPorRodada: 1,
    destino: 'Semifinal',
    ...overrides,
  };
}

const TEAMS = new Map<string, OverlayKocTeam>([
  ['e', { players: ['Hölting Nilsson', 'Berger'], photos: ['https://cdn.example/hn.jpg', null] }],
  ['d', { players: ['Batrane', 'Tiisaar'] }],
  ['a', { players: ['Van', 'Aye'] }],
  ['b', { players: ['Bro', 'Dau'] }],
  ['c', { players: ['Sor', 'Ham'] }],
]);

async function render(inputs: Record<string, unknown> = {}) {
  const fixture = TestBed.createComponent(OverlayKocQualifiedComponent);
  const all = {
    board: board(),
    teams: TEAMS,
    tournamentName: 'Etapa Goiânia',
    phaseName: 'Classificatória',
    categoryName: 'Masculino B',
    ...inputs,
  };
  for (const [key, value] of Object.entries(all)) fixture.componentRef.setInput(key, value);
  await fixture.whenStable();
  return fixture;
}

function host(fixture: { nativeElement: unknown }): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

describe('OverlayKocQualifiedComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OverlayKocQualifiedComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
  });

  it('não desenha nada por cima do vídeo sem quadro', async () => {
    const fixture = await render({ board: null });

    expect(host(fixture).querySelector('.card')).toBeNull();
    expect((host(fixture).textContent ?? '').trim()).toBe('');
  });

  it('leva a marca da nexaGO no canto', async () => {
    const fixture = await render();

    expect((fixture.nativeElement as HTMLElement).querySelector('og-overlay-mark')).not.toBeNull();
  });

  it('identifica evento, fase e categoria no cabeçalho', async () => {
    const text = (host(await render()).textContent ?? '').replace(/\s+/g, ' ');

    expect(text).toContain('Etapa Goiânia');
    expect(text).toContain('Classificatória');
    expect(text).toContain('Masculino B');
    expect(text).toContain('Classificadas');
    expect(text).toContain('Vagas garantidas na Semifinal');
  });

  it('lista cada classificada com a origem da vaga', async () => {
    const fixture = await render();
    const linhas = [...host(fixture).querySelectorAll('.row')];

    expect(linhas.length).toBe(4);
    expect(linhas[0].textContent).toContain('Hölting Nilsson · Berger');
    expect(linhas[0].textContent?.replace(/\s+/g, ' ')).toContain('1º · Rodada 1');
    expect(linhas[3].textContent).toContain('Bro · Dau');
  });

  it('mostra avatares com foto ou iniciais de cada atleta', async () => {
    const fixture = await render();
    const primeira = host(fixture).querySelectorAll('.row')[0];
    const avatars = [...primeira.querySelectorAll('og-avatar')];

    expect(avatars.length).toBe(2);
    expect(avatars[0].querySelector('img')?.getAttribute('src')).toBe('https://cdn.example/hn.jpg');
    expect(avatars[1].textContent?.trim()).toBe('BE');
  });

  it('mostra o progresso da fase e quantas rodadas faltam', async () => {
    const text = (host(await render()).textContent ?? '').replace(/\s+/g, ' ');

    expect(text).toContain('4');
    expect(text).toContain('de 7 rodadas');
    expect(text).toContain('Faltam');
    expect(text).toContain('3');
  });

  it('anuncia a cota de vagas por rodada', async () => {
    const umaVaga = (host(await render()).textContent ?? '').replace(/\s+/g, ' ');
    expect(umaVaga).toContain('1 vaga por rodada');

    const duasVagas = (
      host(await render({ board: board({ vagasPorRodada: 2 }) })).textContent ?? ''
    ).replace(/\s+/g, ' ');
    expect(duasVagas).toContain('2 vagas por rodada');
  });

  it('a barra tem um segmento por rodada, preenchidos só os encerrados', async () => {
    const fixture = await render();
    const segs = [...host(fixture).querySelectorAll('.seg')];

    expect(segs.length).toBe(7);
    expect(segs.filter((s) => s.classList.contains('seg--done')).length).toBe(4);
  });

  it('revela as duplas em ordem de rodada, com 120ms entre elas', async () => {
    const fixture = await render();
    const atrasos = [...host(fixture).querySelectorAll<HTMLElement>('.row')].map((el) =>
      parseFloat(el.style.animationDelay),
    );

    expect(atrasos[0]).toBe(260);
    expect(atrasos[1] - atrasos[0]).toBe(120);
    expect(atrasos[3]).toBe(260 + 3 * 120);
  });

  it('marca como nova a dupla que acabou de classificar', async () => {
    const fixture = await render();
    expect(host(fixture).querySelector('.row--nova')).toBeNull();

    fixture.componentRef.setInput(
      'board',
      board({
        entries: [...board().entries, { teamId: 'c', place: 1, roundLabel: 5 }],
        roundsDone: 5,
      }),
    );
    await fixture.whenStable();
    const novas = [...host(fixture).querySelectorAll('.row--nova')];

    expect(novas.length).toBe(1);
    expect(novas[0].textContent).toContain('Sor · Ham');
    expect(novas[0].textContent).toContain('Nova');
  });
});
