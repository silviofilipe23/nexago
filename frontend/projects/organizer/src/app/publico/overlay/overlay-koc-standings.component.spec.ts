import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { OverlayKocTeam } from './overlay-koc-bar.component';
import { OverlayKocStandingsComponent } from './overlay-koc-standings.component';
import type { KocStandingsBoard } from './overlay-koc-standings';

function board(overrides: Partial<KocStandingsBoard> = {}): KocStandingsBoard {
  return {
    rows: [
      { place: 1, teamId: 'e', points: 8, status: 'king' },
      { place: 2, teamId: 'd', points: 7, status: 'qualified' },
      { place: 3, teamId: 'a', points: 4, status: 'out' },
      { place: 4, teamId: 'b', points: 2, status: 'out' },
      { place: 5, teamId: 'c', points: 1, status: 'out' },
    ],
    vagas: 2,
    destino: 'Semifinal',
    proxima: 'Rodada 4',
    totalRounds: 7,
    ...overrides,
  };
}

const TEAMS = new Map<string, OverlayKocTeam>([
  ['e', { players: ['Hölting Nilsson', 'Berger'] }],
  ['d', { players: ['Batrane', 'Tiisaar'] }],
  ['a', { players: ['Van', 'Aye'] }],
  ['b', { players: ['Bro', 'Dau'] }],
  ['c', { players: ['Sor', 'Ham'] }],
]);

async function render(inputs: Record<string, unknown> = {}) {
  const fixture = TestBed.createComponent(OverlayKocStandingsComponent);
  const all = {
    board: board(),
    teams: TEAMS,
    categoryName: 'Masculino B',
    courtName: 'Quadra 2',
    phaseName: 'Classificatória',
    roundLabel: 3,
    ...inputs,
  };
  for (const [key, value] of Object.entries(all)) fixture.componentRef.setInput(key, value);
  await fixture.whenStable();
  return fixture;
}

function rowsOf(fixture: { nativeElement: unknown }): HTMLElement[] {
  return [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.row')];
}

describe('OverlayKocStandingsComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OverlayKocStandingsComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
  });

  it('não desenha nada por cima do vídeo sem tabela', async () => {
    const fixture = await render({ board: null });
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('.card')).toBeNull();
    expect((host.textContent ?? '').trim()).toBe('');
  });

  it('mostra cabeçalho, colocação, dupla e pontos', async () => {
    const fixture = await render();
    const text = ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' ');

    expect(text).toContain('Masculino B');
    expect(text).toContain('Classificatória');
    expect(text).toContain('Quadra 2');
    expect(text).toContain('Rodada 3 de 7');
    expect(text).toContain('Rodada encerrada');
    expect(text).toContain('Hölting Nilsson · Berger');
    expect(text).toContain('8');
    expect(rowsOf(fixture).length).toBe(5);
  });

  it('marca o rei, a classificada e as eliminadas com o destino da vaga', async () => {
    const fixture = await render();
    const text = ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' ');

    expect(text).toContain('1º lugar · Semifinal');
    expect(text).toContain('Classificada · Semifinal');
    expect(text).toContain('Eliminada');
  });

  it('põe a linha de corte logo antes das eliminadas, com vagas e destino', async () => {
    const fixture = await render();
    const host = fixture.nativeElement as HTMLElement;
    const cut = host.querySelector('.cut');
    const filhos = [...(host.querySelector('.rows')?.children ?? [])];

    // Caixa alta e o espaço entre os pedaços são do CSS (text-transform + gap do flex), então
    // o texto do DOM vem como escrito no template.
    expect(cut?.textContent).toContain('2 vagas');
    expect(cut?.textContent).toContain('Semifinal');
    // Depois das duas classificadas, antes da 3ª colocada.
    expect(filhos.indexOf(cut as Element)).toBe(2);
  });

  it('revela de trás para frente: o último colocado entra antes do primeiro', async () => {
    const fixture = await render();
    const delays = rowsOf(fixture).map((el) => parseFloat(el.style.animationDelay));

    expect(delays[4]).toBeLessThan(delays[0]);
    expect(delays[4]).toBe(260);
    expect(delays[3] - delays[4]).toBe(130);
  });

  it('não promete destino quando a categoria não tem fase seguinte', async () => {
    const fixture = await render({ board: board({ destino: null }) });
    const text = ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' ');

    expect(text).toContain('Classificada');
    expect(text).not.toContain('Classificada ·');
  });

  it('anuncia a próxima rodada no rodapé', async () => {
    const fixture = await render();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Rodada 4');
  });

  it('pontos novos redesenham sem recriar a linha, para não re-animar', async () => {
    const fixture = await render();
    const antes = rowsOf(fixture)[0];

    const atualizado = board();
    atualizado.rows = atualizado.rows.map((r) => ({ ...r, points: r.points + 1 }));
    fixture.componentRef.setInput('board', atualizado);
    await fixture.whenStable();
    const depois = rowsOf(fixture)[0];

    expect(depois).toBe(antes);
    expect(depois.textContent).toContain('9');
  });

  it('o brilho do campeão só começa depois que a última linha apareceu', () => {
    // 260ms de espera inicial + 5 linhas x 130ms de intervalo + 440ms da última animação.
    const esperado = 260 + 5 * 130 + 440;

    return render().then((fixture) => {
      const rei = rowsOf(fixture)[0];
      const atrasos = rei.style.animationDelay.split(',').map((v) => parseFloat(v));

      expect(atrasos.length).toBe(2);
      expect(atrasos[0]).toBe(260 + 4 * 130);
      expect(atrasos[1]).toBe(esperado);
    });
  });
});
