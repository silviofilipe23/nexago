import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { KocStandingsBoard } from '../overlay/overlay-koc-standings';
import type { LedTeam } from './led-round.component';
import { LedStandingsComponent } from './led-standings.component';

function board(overrides: Partial<KocStandingsBoard> = {}): KocStandingsBoard {
  return {
    rows: [
      { place: 1, teamId: 'a', points: 17, status: 'king' },
      { place: 2, teamId: 'b', points: 14, status: 'out' },
      { place: 3, teamId: 'c', points: 10, status: 'out' },
      { place: 4, teamId: 'd', points: 8, status: 'out' },
      { place: 5, teamId: 'e', points: 4, status: 'out' },
    ],
    vagas: 1,
    destino: 'Semifinal',
    proxima: 'Rodada 4',
    totalRounds: 7,
    ...overrides,
  };
}

const TEAMS = new Map<string, LedTeam>([
  [
    'a',
    {
      players: [
        { name: 'Sor', initials: 'SO', photoUrl: null },
        { name: 'Ham', initials: 'HA', photoUrl: null },
      ],
    },
  ],
  [
    'b',
    {
      players: [
        { name: 'Bro', initials: 'BR', photoUrl: null },
        { name: 'Dau', initials: 'DA', photoUrl: null },
      ],
    },
  ],
  [
    'c',
    {
      players: [
        { name: 'Batrane', initials: 'BA', photoUrl: null },
        { name: 'Tiisaar', initials: 'TI', photoUrl: null },
      ],
    },
  ],
  [
    'd',
    {
      players: [
        { name: 'Hölting Nilsson', initials: 'HÖ', photoUrl: null },
        { name: 'Berger', initials: 'BE', photoUrl: null },
      ],
    },
  ],
  [
    'e',
    {
      players: [
        { name: 'Van', initials: 'VA', photoUrl: null },
        { name: 'Aye', initials: 'AY', photoUrl: null },
      ],
    },
  ],
]);

async function render(inputs: Record<string, unknown> = {}) {
  const fixture = TestBed.createComponent(LedStandingsComponent);
  const all = { board: board(), teams: TEAMS, categoryName: 'Masculino B', roundLabel: 3, ...inputs };
  for (const [key, value] of Object.entries(all)) fixture.componentRef.setInput(key, value);
  await fixture.whenStable();
  return fixture;
}

function host(fixture: { nativeElement: unknown }): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

describe('LedStandingsComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LedStandingsComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
  });

  it('não desenha nada sem tabela', async () => {
    expect(host(await render({ board: null })).querySelector('.tela')).toBeNull();
  });

  it('leva a marca da nexaGO, sem flutuar por cima do conteúdo', async () => {
    const marca = host(await render()).querySelector('og-overlay-mark');

    expect(marca).not.toBeNull();
    // No LED os cantos direitos têm dono (relógio, fila), então ela entra no cabeçalho.
    expect(marca?.getAttribute('data-flow')).toBe('true');
  });

  it('anuncia a rodada encerrada, a cota e o destino', async () => {
    const text = (host(await render()).textContent ?? '').replace(/\s+/g, ' ');

    expect(text).toContain('Rodada');
    expect(text).toContain('encerrada');
    expect(text).toContain('Masculino B');
    expect(text).toContain('1 vaga');
    expect(text).toContain('Semifinal');
  });

  it('lista colocação, avatares, nomes e pontos', async () => {
    const linhas = [...host(await render()).querySelectorAll('.linha')];

    expect(linhas.length).toBe(5);
    expect(linhas[0].textContent).toContain('Sor · Ham');
    expect(linhas[0].textContent).toContain('17');
    expect(linhas[0].querySelectorAll('og-avatar').length).toBe(2);
    expect([...linhas[0].querySelectorAll('og-avatar')].map((e) => e.textContent?.trim())).toEqual(['SO', 'HA']);
    expect(linhas[4].textContent).toContain('Van · Aye');
  });

  it('só quem entrou na cota fica verde, com a tag', async () => {
    const linhas = [...host(await render()).querySelectorAll('.linha')];

    expect(linhas[0].classList.contains('linha--classificada')).toBeTrue();
    expect(linhas[0].textContent).toContain('Classificada');
    expect(linhas.slice(1).every((l) => !l.classList.contains('linha--classificada'))).toBeTrue();
  });

  it('com duas vagas, duas linhas ficam verdes sem eu mexer', async () => {
    const duas = board({
      vagas: 2,
      rows: [
        { place: 1, teamId: 'a', points: 17, status: 'king' },
        { place: 2, teamId: 'b', points: 14, status: 'qualified' },
        { place: 3, teamId: 'c', points: 10, status: 'out' },
      ],
    });
    const linhas = [...host(await render({ board: duas })).querySelectorAll('.linha')];

    expect(linhas.filter((l) => l.classList.contains('linha--classificada')).length).toBe(2);
  });

  it('revela de baixo para cima: o último colocado entra primeiro', async () => {
    const atrasos = [...host(await render()).querySelectorAll<HTMLElement>('.linha')].map((el) =>
      parseFloat(el.style.animationDelay),
    );

    expect(atrasos[4]).toBe(350);
    expect(atrasos[3] - atrasos[4]).toBe(200);
    expect(atrasos[0]).toBe(350 + 4 * 200);
  });

  it('o brilho do 1º acompanha o número real de duplas', async () => {
    const cinco = host(await render()).querySelector<HTMLElement>('.linha--classificada');
    expect(parseFloat(cinco!.style.animationDelay.split(',')[1])).toBe(350 + 5 * 200);

    const tres = board({
      rows: [
        { place: 1, teamId: 'a', points: 9, status: 'king' },
        { place: 2, teamId: 'b', points: 5, status: 'out' },
        { place: 3, teamId: 'c', points: 2, status: 'out' },
      ],
    });
    const comTres = host(await render({ board: tres })).querySelector<HTMLElement>('.linha--classificada');
    expect(parseFloat(comTres!.style.animationDelay.split(',')[1])).toBe(350 + 3 * 200);
  });
});
