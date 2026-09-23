import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { OverlayKocTeam } from './overlay-koc-bar.component';
import type { KocPreRound } from './overlay-koc-preround';
import { OverlayKocPreRoundComponent } from './overlay-koc-preround.component';

function pre(overrides: Partial<KocPreRound> = {}): KocPreRound {
  return {
    tronoTeamId: 't',
    rows: [
      { posicao: 1, teamId: 'a', papel: 'desafia' },
      { posicao: 2, teamId: 'b', papel: 'sequencia' },
      { posicao: 3, teamId: 'c', papel: 'aguardando' },
      { posicao: 4, teamId: 'd', papel: 'aguardando' },
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

  it('identifica quadra, categoria e rodada', async () => {
    const text = (host(await render()).textContent ?? '').replace(/\s+/g, ' ');

    expect(text).toContain('Quadra 2');
    expect(text).toContain('Masculino B');
    expect(text).toContain('Rodada 3/7');
    expect(text).toContain('Próximos');
  });

  it('lista a ordem de entrada com iniciais e nomes', async () => {
    const linhas = [...host(await render()).querySelectorAll('.linha')];

    expect(linhas.length).toBe(4);
    expect(linhas[0].textContent).toContain('Hölting Nilsson · Berger');
    expect([...linhas[0].querySelectorAll('.inicial')].map((e) => e.textContent)).toEqual(['HN', 'BE']);
    expect(linhas[3].textContent).toContain('Bro · Dau');
  });

  it('diz o papel de cada uma na entrada', async () => {
    const text = (host(await render()).textContent ?? '').replace(/\s+/g, ' ');

    expect(text).toContain('Entra agora');
    expect(text).toContain('Desafia o trono');
    expect(text).toContain('Na sequência');
    expect(text).toContain('Aguardando');
  });

  it('destaca só quem entra agora', async () => {
    const linhas = [...host(await render()).querySelectorAll('.linha')];

    expect(linhas[0].classList.contains('linha--agora')).toBeTrue();
    expect(linhas.slice(1).every((l) => !l.classList.contains('linha--agora'))).toBeTrue();
  });

  it('anuncia quem começa no trono', async () => {
    const trono = host(await render()).querySelector('.trono');

    expect(trono?.textContent).toContain('Sor · Ham');
    expect(trono?.textContent?.toLowerCase()).toContain('trono');
  });
});
