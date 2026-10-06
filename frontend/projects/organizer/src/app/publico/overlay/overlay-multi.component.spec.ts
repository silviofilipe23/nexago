import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { MultiCard } from './overlay-multi';
import { OverlayMultiComponent } from './overlay-multi.component';

const base = (over: Partial<MultiCard> = {}): MultiCard => ({
  courtId: 'q1',
  number: 1,
  courtName: 'Quadra 1',
  context: 'Masculino B · Semifinal',
  status: 'live',
  time: null,
  matchId: 'm1',
  a: { teamId: 'ta', label: 'Hölting Nilsson / Berger', serving: true },
  b: { teamId: 'tb', label: 'Batrane / Tiisaar', serving: false },
  sets: [{ a: 21, b: 18 }],
  live: { a: 10, b: 8 },
  games: false,
  liveGame: null,
  tiebreak: null,
  setNumber: 2,
  setsA: 1,
  setsB: 0,
  winner: null,
  pointSide: null,
  ...over,
});

async function mount(cards: MultiCard[], mode: 'full' | 'strip' = 'full') {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const fixture = TestBed.createComponent(OverlayMultiComponent);
  fixture.componentRef.setInput('cards', cards);
  fixture.componentRef.setInput('mode', mode);
  fixture.componentRef.setInput('sponsors', [{ nome: 'S1', logo: '' }]);
  await fixture.whenStable();
  return fixture;
}

describe('OverlayMultiComponent', () => {
  it('games: set em andamento laranja, ponto do game no quadro e rodapé com tie-break', async () => {
    const f = await mount([base({ games: true, live: { a: 6, b: 6 }, liveGame: { a: '5', b: '4' }, tiebreak: 'tiebreak', sets: [{ a: 7, b: 6 }], setNumber: 2 })]);
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelectorAll('.set--live').length).toBe(2);
    expect(Array.from(el.querySelectorAll('.pts')).map((e) => e.textContent?.trim())).toEqual(['5', '4']);
    expect(el.querySelector('.c-pe')?.textContent).toContain('Tie-break');
  });

  it('games: super tie-break no rodapé e AD no quadro', async () => {
    const f = await mount([base({ games: true, live: { a: 0, b: 0 }, liveGame: { a: '9', b: '8' }, tiebreak: 'super', setNumber: 3 })]);
    expect((f.nativeElement as HTMLElement).querySelector('.c-pe')?.textContent).toContain('Super tie-break');
  });

  it('tela cheia: título, um cartão por quadra, destaque e patrocinadores', async () => {
    const f = await mount([base(), base({ courtId: 'q2', number: 2, status: 'scheduled', time: '15:40', live: null, sets: [] })]);
    f.componentRef.setInput('focusCourtId', 'q2');
    await f.whenStable();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('h1')?.textContent).toContain('quadras');
    expect(el.querySelectorAll('.card').length).toBe(2);
    expect(el.querySelectorAll('.card--foco').length).toBe(1);
    expect(el.querySelector('.card .tag--live')).not.toBeNull();
    expect(el.querySelector('.prox-h')?.textContent).toContain('15:40');
    expect(el.querySelector('.patro')).not.toBeNull();
  });

  it('set point acende o cartão e mostra quem está com o ponto', async () => {
    const f = await mount([base({ status: 'setpoint', pointSide: 'A', live: { a: 20, b: 18 } })]);
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('.card--hot')).not.toBeNull();
    expect(el.querySelector('.c-pe .hot')?.textContent).toContain('set point');
  });

  it('final: perdedora apagada e vencedora com "Venceu"', async () => {
    const f = await mount([base({ status: 'final', live: null, winner: 'A', sets: [{ a: 21, b: 15 }, { a: 21, b: 19 }], setsA: 2, setsB: 0 })]);
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelectorAll('.lado--lose').length).toBe(1);
    expect(el.querySelector('.venceu')?.textContent).toContain('Venceu');
    expect(el.querySelector('.c-pe')?.textContent).toContain('2–0');
  });

  it('faixa: sem cabeçalho nem patrocinadores', async () => {
    const f = await mount([base()], 'strip');
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('h1')).toBeNull();
    expect(el.querySelector('.patro')).toBeNull();
    expect(el.querySelectorAll('.sc').length).toBe(1);
  });

  it('quadro de pontos pisca quando o ponto sobe na mesma partida', async () => {
    const f = await mount([base()]);
    f.componentRef.setInput('cards', [base({ live: { a: 11, b: 8 } })]);
    await f.whenStable();
    expect((f.nativeElement as HTMLElement).querySelectorAll('.pts--flash').length).toBe(1);
  });
});
