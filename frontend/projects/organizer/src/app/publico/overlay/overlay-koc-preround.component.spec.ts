import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { OverlayKocTeam } from './overlay-koc-bar.component';
import type { KocPreRound } from './overlay-koc-preround';
import { OverlayKocPreRoundComponent } from './overlay-koc-preround.component';

function pre(overrides: Partial<KocPreRound> = {}): KocPreRound {
  return {
    tronoTeamId: 't',
    isFinal: false,
    teamCount: 5,
    rows: [
      { posicao: 1, teamId: 't', papel: 'trono', points: 0 },
      { posicao: 2, teamId: 'a', papel: 'desafia', points: 0 },
      { posicao: 3, teamId: 'b', papel: 'sequencia', points: 0 },
      { posicao: 4, teamId: 'c', papel: 'aguardando', points: 0 },
      { posicao: 5, teamId: 'd', papel: 'aguardando', points: 0 },
    ],
    ...overrides,
  };
}

const TEAMS = new Map<string, OverlayKocTeam>([
  ['t', { players: ['Sor', 'Ham'] }],
  ['a', { players: ['Hölting Nilsson', 'Berger'] }],
  ['b', { players: ['Batrane', 'Tiisaar'] }],
  ['c', { players: ['Van', 'Aye'] }],
  ['d', { players: ['Bro', 'Dau'] }],
]);

async function render(inputs: Record<string, unknown> = {}) {
  const fixture = TestBed.createComponent(OverlayKocPreRoundComponent);
  const all = {
    preRound: pre(),
    teams: TEAMS,
    categoryName: 'Masculino B',
    courtName: 'Quadra 2',
    roundTitle: 'Rodada 3/7',
    ...inputs,
  };
  for (const [key, value] of Object.entries(all)) fixture.componentRef.setInput(key, value);
  await fixture.whenStable();
  return fixture;
}

function host(fixture: { nativeElement: unknown }): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

describe('OverlayKocPreRoundComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OverlayKocPreRoundComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
  });

  it('não desenha nada sem elenco', async () => {
    const h = host(await render({ preRound: null }));

    expect(h.querySelector('.card')).toBeNull();
    expect((h.textContent ?? '').trim()).toBe('');
  });

  it('leva a marca da nexaGO no canto', async () => {
    const fixture = await render();

    expect((fixture.nativeElement as HTMLElement).querySelector('og-overlay-mark')).not.toBeNull();
  });

  it('identifica quadra, categoria e rodada', async () => {
    const text = (host(await render()).textContent ?? '').replace(/\s+/g, ' ');

    expect(text).toContain('Quadra 2');
    expect(text).toContain('Masculino B');
    expect(text).toContain('Rodada 3/7');
    expect(text).toContain('Próximos');
  });

  it('lista a ordem de entrada com avatares e nomes', async () => {
    const h = host(
      await render({
        teams: new Map<string, OverlayKocTeam>([
          ['t', { players: ['Sor', 'Ham'], photos: [null, null] }],
          [
            'a',
            {
              players: ['Hölting Nilsson', 'Berger'],
              photos: ['https://cdn.example/hn.jpg', null],
            },
          ],
          ['b', { players: ['Batrane', 'Tiisaar'] }],
          ['c', { players: ['Van', 'Aye'] }],
          ['d', { players: ['Bro', 'Dau'] }],
        ]),
      }),
    );
    const linhas = [...h.querySelectorAll('.linha')];

    expect(linhas.length).toBe(5);
    expect(linhas[0].textContent).toContain('Sor · Ham');
    expect(linhas[1].textContent).toContain('Hölting Nilsson · Berger');
    const avatars = [...linhas[1].querySelectorAll('og-avatar')];
    expect(avatars.length).toBe(2);
    expect(avatars[0].querySelector('img')?.getAttribute('src')).toBe('https://cdn.example/hn.jpg');
    expect(avatars[1].textContent?.trim()).toBe('BE');
    expect(linhas[4].textContent).toContain('Bro · Dau');
  });

  it('diz o papel de cada uma na entrada', async () => {
    const text = (host(await render()).textContent ?? '').replace(/\s+/g, ' ');

    expect(text).toContain('Começa no trono');
    expect(text).toContain('Entra agora');
    expect(text).toContain('Desafia o trono');
    expect(text).toContain('Na sequência');
    expect(text).toContain('Aguardando');
  });

  it('destaca quem começa no trono; os demais ficam abaixo', async () => {
    const linhas = [...host(await render()).querySelectorAll('.linha')];

    expect(linhas[0].classList.contains('linha--agora')).toBeTrue();
    expect(linhas[0].textContent).toContain('Começa no trono');
    expect(linhas.slice(1).every((l) => !l.classList.contains('linha--agora'))).toBeTrue();
  });

  it('marca o desafiante como próximo, com status em destaque', async () => {
    const linhas = [...host(await render()).querySelectorAll('.linha')];

    expect(linhas[1].classList.contains('linha--prox')).toBeTrue();
    expect(linhas.filter((l, i) => i !== 1).every((l) => !l.classList.contains('linha--prox'))).toBeTrue();
  });

  it('anuncia quem começa no trono', async () => {
    const trono = host(await render()).querySelector('.trono');

    expect(trono?.textContent).toContain('Sor · Ham');
    expect(trono?.textContent?.toLowerCase()).toContain('trono');
  });

  it('na Grande final lista todas as duplas e o rodapé do título', async () => {
    const h = host(
      await render({
        preRound: pre({
          isFinal: true,
          teamCount: 4,
          rows: [
            { posicao: 1, teamId: 't', papel: 'trono', points: 7 },
            { posicao: 2, teamId: 'a', papel: 'desafia', points: 4 },
            { posicao: 3, teamId: 'b', papel: 'sequencia', points: 2 },
            { posicao: 4, teamId: 'c', papel: 'aguardando', points: 1 },
          ],
        }),
      }),
    );
    const text = (h.textContent ?? '').replace(/\s+/g, ' ');

    expect(text).toContain('Grande final');
    expect(text).toContain('Próximos em quadra');
    expect(text).toContain('4 duplas finalistas');
    expect(text).toContain('Valendo o título');
    expect(text).toContain('só o trono pontua');
    expect(h.querySelector('.card--final')).not.toBeNull();
    const linhas = [...h.querySelectorAll('.linha')];
    expect(linhas.length).toBe(4);
    expect(linhas[0].textContent).toContain('No trono');
    expect(linhas[0].querySelector('.pts')).toBeNull();
    expect(h.querySelector('.trono')).toBeNull();
  });
});
