import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { KocPreRound } from '../overlay/overlay-koc-preround';
import type { LedTeam } from './led-round.component';
import { LedPreRoundComponent } from './led-preround.component';

function pre(overrides: Partial<KocPreRound> = {}): KocPreRound {
  return {
    tronoTeamId: 't',
    rows: [
      { posicao: 1, teamId: 't', papel: 'trono' },
      { posicao: 2, teamId: 'a', papel: 'desafia' },
      { posicao: 3, teamId: 'b', papel: 'sequencia' },
      { posicao: 4, teamId: 'c', papel: 'aguardando' },
      { posicao: 5, teamId: 'd', papel: 'aguardando' },
    ],
    ...overrides,
  };
}

function dupla(a: string, b: string): LedTeam {
  return {
    players: [a, b].map((name) => ({ name, initials: '', photoUrl: null })),
  };
}

const TEAMS = new Map<string, LedTeam>([
  ['t', dupla('Van', 'Aye')],
  ['a', dupla('Bro', 'Dau')],
  ['b', dupla('Sor', 'Ham')],
  ['c', dupla('Hölting Nilsson', 'Berger')],
  ['d', dupla('Batrane', 'Tiisaar')],
]);

async function render(inputs: Record<string, unknown> = {}) {
  const fixture = TestBed.createComponent(LedPreRoundComponent);
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

describe('LedPreRoundComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LedPreRoundComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
  });

  it('não desenha nada sem elenco', async () => {
    const h = host(await render({ preRound: null }));

    expect(h.querySelector('.tela')).toBeNull();
    expect((h.textContent ?? '').trim()).toBe('');
  });

  it('leva a marca da nexaGO, sem flutuar por cima do conteúdo', async () => {
    const marca = host(await render()).querySelector('og-overlay-mark');

    expect(marca).not.toBeNull();
    // No LED os cantos direitos têm dono (relógio, fila), então ela entra no cabeçalho.
    expect(marca?.getAttribute('data-flow')).toBe('true');
  });

  it('mostra título e o contexto da rodada', async () => {
    const text = (host(await render()).textContent ?? '').replace(/\s+/g, ' ');

    expect(text).toContain('Próximos em quadra');
    expect(text).toContain('Masculino B');
    expect(text).toContain('Quadra 2');
    expect(text).toContain('Rodada 3/7');
  });

  it('põe quem começa no trono na posição 1, com nome e iniciais', async () => {
    const trono = host(await render()).querySelector('.trono')!;

    expect(trono.textContent).toContain('No trono');
    expect(trono.textContent).toContain('Van');
    expect(trono.textContent).toContain('Aye');
    expect(trono.querySelector('.ordem')?.textContent?.trim()).toBe('1');
    // Sem foto, o `og-avatar` cai nas iniciais — e o nome de uma palavra usa duas letras.
    expect([...trono.querySelectorAll('og-avatar')].map((e) => e.textContent?.trim())).toEqual([
      'VA',
      'AY',
    ]);
  });

  it('não repete no card quem já está no bloco do trono', async () => {
    const cards = [...host(await render()).querySelectorAll('.card')];

    expect(cards.length).toBe(4);
    expect(cards.some((c) => (c.textContent ?? '').includes('Van'))).toBeFalse();
  });

  it('numera a fila a partir de 2, seguindo a ordem de entrada', async () => {
    const cards = [...host(await render()).querySelectorAll('.card')];

    expect(cards.length).toBe(4);
    expect(cards.map((c) => c.querySelector('.ordem')?.textContent?.trim())).toEqual([
      '2',
      '3',
      '4',
      '5',
    ]);
  });

  it('diz o papel de cada uma na entrada', async () => {
    const cards = [...host(await render()).querySelectorAll('.card')];

    expect(cards[0].textContent).toContain('Desafiante · Em quadra');
    expect(cards[1].textContent).toContain('Próxima a desafiar');
    expect(cards[2].textContent).toContain('Aguardando');
    expect(cards[3].textContent).toContain('Aguardando');
  });

  it('destaca só quem já entra em quadra', async () => {
    const cards = [...host(await render()).querySelectorAll('.card')];

    expect(cards[0].classList.contains('card--emquadra')).toBeTrue();
    expect(cards.slice(1).every((c) => !c.classList.contains('card--emquadra'))).toBeTrue();
  });

  it('funciona na rodada mínima de três duplas', async () => {
    const h = host(
      await render({
        preRound: pre({
          rows: [
            { posicao: 1, teamId: 't', papel: 'trono' },
            { posicao: 2, teamId: 'a', papel: 'desafia' },
            { posicao: 3, teamId: 'b', papel: 'sequencia' },
          ],
        }),
      }),
    );

    expect(h.querySelectorAll('.card').length).toBe(2);
    expect(h.querySelector('.trono')).not.toBeNull();
  });
});
