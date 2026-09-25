import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { OverlayKocBarComponent } from './overlay-koc-bar.component';
import type { OverlayKocBlock } from './overlay-koc-bar';
import type { OverlayKocView } from './overlay-selectors';

function block(overrides: Partial<OverlayKocBlock>): OverlayKocBlock {
  return { role: 'queue', teamId: 'a', points: 0, nextUp: false, ...overrides };
}

function view(overrides: Partial<OverlayKocView> = {}): OverlayKocView {
  return {
    kind: 'koc',
    phase: 'live',
    roundTitle: 'Classificatória · Rodada 3/7',
    bar: {
      blocks: [
        block({ teamId: 'a' }),
        block({ teamId: 'b' }),
        block({ teamId: 'c', nextUp: true }),
        block({ role: 'challenger', teamId: 'd', points: 0 }),
        block({ role: 'king', teamId: 'e', points: 0 }),
      ],
      streak: null,
      clock: { label: '13:56', paused: false },
    },
    ...overrides,
  };
}

const TEAMS = new Map<string, { players: [string, string] }>([
  ['a', { players: ['Van', 'Aye'] }],
  ['b', { players: ['Bro', 'Dau'] }],
  ['c', { players: ['Sor', 'Ham'] }],
  ['d', { players: ['Batrane', 'Tiisaar'] }],
  ['e', { players: ['Hölting Nilsson', 'Berger'] }],
]);

async function render(inputs: Record<string, unknown>) {
  const fixture = TestBed.createComponent(OverlayKocBarComponent);
  for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
  await fixture.whenStable();
  return fixture;
}

describe('OverlayKocBarComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OverlayKocBarComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
  });

  it('não desenha nada por cima do vídeo sem rodada no ar', async () => {
    const fixture = await render({ view: null, categoryName: 'Masculino B' });
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('.bar')).toBeNull();
    expect((host.textContent ?? '').trim()).toBe('');
  });

  it('leva a marca da nexaGO no canto', async () => {
    const fixture = await render({ view: view(), teams: TEAMS });

    expect((fixture.nativeElement as HTMLElement).querySelector('og-overlay-mark')).not.toBeNull();
  });

  it('mostra a rodada inteira, da fila ao trono, com os dois atletas de cada dupla', async () => {
    const fixture = await render({
      view: view(),
      teams: TEAMS,
      categoryName: 'Masculino B',
      courtName: 'Quadra 2',
    });
    const host = fixture.nativeElement as HTMLElement;
    const text = (host.textContent ?? '').replace(/\s+/g, ' ');

    expect(host.querySelectorAll('.block').length).toBe(5);
    expect(text).toContain('Van');
    expect(text).toContain('Hölting Nilsson');
    expect(text).toContain('Berger');
    expect(text).toContain('Masculino B');
    expect(text).toContain('Classificatória · Rodada 3/7');
    expect(text).toContain('Quadra 2');
    expect(text).toContain('13:56');
  });

  it('rotula o trono, o desafiante e o próximo da fila', async () => {
    const fixture = await render({ view: view(), teams: TEAMS });
    const text = ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' ');

    expect(text).toContain('NO TRONO');
    expect(text).toContain('DESAFIANTE');
    expect(text).toContain('NA FILA');
  });

  it('no modo Grande final troca o status e o rótulo do trono', async () => {
    const fixture = await render({
      view: view(),
      teams: TEAMS,
      categoryName: 'Masculino B',
      courtName: 'Quadra 2',
      isFinal: true,
    });
    const host = fixture.nativeElement as HTMLElement;
    const text = (host.textContent ?? '').replace(/\s+/g, ' ');

    expect(host.querySelector('.wrap--final')).not.toBeNull();
    expect(host.querySelector('.status-badge')?.textContent).toContain('Grande final');
    expect(text).toContain('Valendo o título');
    expect(text).toContain('Masculino B');
    expect(text).toContain('No trono · final');
    expect(text).not.toContain('Classificatória · Rodada 3/7');
    expect(text).toContain('NEXAGO · KOTC · Final');
    expect(host.querySelector('.bar--final')).not.toBeNull();
  });

  it('categoria feminina vira QUEEN OF THE COURT no status', async () => {
    const fixture = await render({
      view: view(),
      teams: TEAMS,
      categoryName: 'Feminino A',
      categoryGender: 'female',
      isFinal: true,
    });
    const text = ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' ');

    expect(text).toContain('QUEEN OF THE COURT');
    expect(text).not.toContain('Feminino A');
    expect(text).toContain('NEXAGO · QOTC · Final');
  });

  it('anuncia a sequência de defesas do rei', async () => {
    const fixture = await render({
      view: view({ bar: { ...view().bar, streak: 4 } }),
      teams: TEAMS,
    });

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('4 SEGUIDAS');
  });

  it('não mostra selo de sequência quando não há sequência', async () => {
    const fixture = await render({ view: view(), teams: TEAMS });

    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('SEGUIDAS');
  });

  it('acende AO VIVO só com a rodada em andamento', async () => {
    const vivo = await render({ view: view(), teams: TEAMS });
    expect((vivo.nativeElement as HTMLElement).textContent).toContain('AO VIVO');

    const agendada = await render({ view: view({ phase: 'pregame' }), teams: TEAMS });
    expect((agendada.nativeElement as HTMLElement).textContent).not.toContain('AO VIVO');
  });
});
