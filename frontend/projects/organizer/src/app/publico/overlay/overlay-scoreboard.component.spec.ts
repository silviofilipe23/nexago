import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { OverlayScoreboardComponent } from './overlay-scoreboard.component';
import type { OverlayDuelView, OverlayKocView } from './overlay-selectors';

function duel(overrides: Partial<OverlayDuelView> = {}): OverlayDuelView {
  return {
    kind: 'duel',
    phase: 'live',
    a: { teamId: 'ta', label: 'A definir', serving: false },
    b: { teamId: 'tb', label: 'A definir', serving: true },
    setsA: 1,
    setsB: 0,
    pointsA: 14,
    pointsB: 11,
    alert: null,
    showSets: true,
    ...overrides,
  };
}

function koc(overrides: Partial<OverlayKocView> = {}): OverlayKocView {
  return {
    kind: 'koc',
    phase: 'live',
    king: { teamId: 'k', label: '', serving: false },
    challenger: { teamId: 'c', label: '', serving: true },
    kingPoints: 7,
    challengerPoints: 4,
    clock: { label: '2:05', paused: false },
    ...overrides,
  };
}

async function render(inputs: Record<string, unknown>) {
  const fixture = TestBed.createComponent(OverlayScoreboardComponent);
  for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
  await fixture.whenStable();
  return fixture;
}

describe('OverlayScoreboardComponent', () => {
  beforeEach(async () => {
    // Portal zoneless — sem isto o TestBed falha com NG0908.
    await TestBed.configureTestingModule({
      imports: [OverlayScoreboardComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
  });

  it('não desenha nada por cima do vídeo quando não há partida no ar', async () => {
    const fixture = await render({ view: null, band: 'Copa VH · Semifinal' });
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('.overlay')).toBeNull();
    expect((host.textContent ?? '').trim()).toBe('');
  });

  it('mostra nomes resolvidos, sets e pontos do duelo ao vivo', async () => {
    const fixture = await render({
      view: duel(),
      band: 'Copa VH · Feminina B · Semifinal · Quadra 2',
      teamLabels: new Map([
        ['ta', 'Ana / Bia'],
        ['tb', 'Carla / Dani'],
      ]),
    });
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('Ana / Bia');
    expect(text).toContain('Carla / Dani');
    expect(text).toContain('Copa VH · Feminina B · Semifinal · Quadra 2');
    expect(text).toContain('14');
    expect(text).toContain('11');
  });

  it('cai no rótulo da própria partida quando o nome da dupla ainda não resolveu', async () => {
    const fixture = await render({ view: duel(), teamLabels: new Map() });

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('A definir');
  });

  it('anuncia MATCH POINT do lado que pode fechar', async () => {
    const fixture = await render({ view: duel({ alert: { side: 'A', kind: 'match' } }) });

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('MATCH POINT');
  });

  it('mostra rei, desafiante e relógio na rodada KOTC', async () => {
    const fixture = await render({
      view: koc(),
      teamLabels: new Map([
        ['k', 'Ana / Bia'],
        ['c', 'Carla / Dani'],
      ]),
    });
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('Ana / Bia');
    expect(text).toContain('Carla / Dani');
    expect(text).toContain('2:05');
    expect(text).toContain('7');
    expect(text).toContain('4');
  });
});
