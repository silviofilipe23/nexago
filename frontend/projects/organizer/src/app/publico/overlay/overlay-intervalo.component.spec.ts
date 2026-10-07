import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DEFAULT_BROADCAST_INTERVALO, INTERVALO_PRESETS, type BroadcastIntervalo } from '../../painel/data/broadcast-intervalo';
import type { IntervaloGame, IntervaloView } from './overlay-intervalo';
import { OverlayIntervaloComponent } from './overlay-intervalo.component';

const game = (id: string, time: string): IntervaloGame => ({
  matchId: id,
  time,
  a: { teamId: 'ta', label: 'Hölting Nilsson / Berger' },
  b: { teamId: 'tb', label: 'Batrane / Tiisaar' },
  category: 'Masculino B',
  phase: 'Semifinal',
  court: 1,
});

const view: IntervaloView = {
  next: game('n', '15:40'),
  following: [game('f1', '16:20'), game('f2', '17:00'), game('f3', '17:40')],
  results: [
    { matchId: 'r1', tag: 'Fem. A · QF', winner: { teamId: 'x', label: 'Lopes / Mota' }, loser: { teamId: 'y', label: 'Freitas / Brito' }, score: '2–1' },
    { matchId: 'r2', tag: 'Masc. B · QF', winner: { teamId: 'z', label: 'Duarte / Sales' }, loser: { teamId: 'w', label: 'Nunes / Rios' }, score: '2–0' },
  ],
};

const cfg = (over: Partial<BroadcastIntervalo> = {}): BroadcastIntervalo => ({ ...DEFAULT_BROADCAST_INTERVALO, on: true, ...over });

describe('OverlayIntervaloComponent', () => {
  beforeEach(() => jasmine.clock().install());
  afterEach(() => jasmine.clock().uninstall());

  async function mount(c: BroadcastIntervalo | null) {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const f = TestBed.createComponent(OverlayIntervaloComponent);
    f.componentRef.setInput('config', c);
    f.componentRef.setInput('view', c ? view : null);
    f.componentRef.setInput('eventName', 'Etapa Praia do Futuro');
    f.componentRef.setInput('sponsors', [{ nome: 'S1', logo: '' }, { nome: 'S2', logo: '' }]);
    await f.whenStable();
    return { f, el: f.nativeElement as HTMLElement };
  }

  it('entrada: a cortina cobre primeiro e o conteúdo só aparece aos 0,5 s', async () => {
    const { f, el } = await mount(cfg());
    expect(el.querySelector('.cortina')).not.toBeNull();
    expect(el.querySelector('.tela')).toBeNull();
    jasmine.clock().tick(500);
    await f.whenStable();
    expect(el.querySelector('.tela')).not.toBeNull();
    expect(el.querySelector('.selo')?.textContent).toContain('Intervalo');
    expect(el.querySelector('h1')?.textContent).toContain('na arena');
  });

  it('mostra o A seguir, os 3 seguintes, o letreiro duplicado e os patrocinadores', async () => {
    const { f, el } = await mount(cfg());
    jasmine.clock().tick(500);
    await f.whenStable();
    expect(el.querySelector('.seguir .seg-k')?.textContent).toContain('A seguir');
    expect(el.querySelectorAll('.seg-nomes span').length).toBe(4);
    expect(el.querySelectorAll('.lin').length).toBe(3);
    // 2 resultados × 2 cópias (rolagem sem emenda)
    expect(el.querySelectorAll('.res').length).toBe(4);
    expect(el.querySelectorAll('.logo').length).toBe(2);
    expect(el.querySelectorAll('.logo--on').length).toBe(1);
  });

  it('contagem: tempo restante e, ao zerar, "Voltando · Agora"', async () => {
    const { f, el } = await mount(cfg({ durationSec: 300, startedAt: new Date(Date.now() - 6_000) }));
    jasmine.clock().tick(500);
    await f.whenStable();
    expect(el.querySelector('.cont-t')?.textContent?.trim()).toBe('4:54');
    f.componentRef.setInput('config', cfg({ durationSec: 300, startedAt: new Date(Date.now() - 400_000) }));
    jasmine.clock().tick(600);
    await f.whenStable();
    expect(el.querySelector('.cont-zero')?.textContent).toContain('Agora');
  });

  it('sem contagem iniciada não mostra o relógio', async () => {
    const { f, el } = await mount(cfg({ startedAt: null }));
    jasmine.clock().tick(500);
    await f.whenStable();
    expect(el.querySelector('.cont')).toBeNull();
  });

  it('mesmo modo atualiza o texto ao vivo, sem cortina nova; modo novo reabre a cortina', async () => {
    const { f, el } = await mount(cfg());
    jasmine.clock().tick(500);
    await f.whenStable();
    const antes = el.querySelectorAll('.cortina').length;
    f.componentRef.setInput('config', cfg({ line1: 'Pausa para', line2: 'o café' }));
    await f.whenStable();
    expect(el.querySelector('h1')?.textContent).toContain('o café');
    expect(el.querySelectorAll('.cortina').length).toBe(antes);
    f.componentRef.setInput('config', cfg({ mode: 'voltamos', ...INTERVALO_PRESETS.voltamos }));
    await f.whenStable();
    jasmine.clock().tick(500);
    await f.whenStable();
    expect(el.querySelector('.selo')?.textContent).toContain('Já voltamos');
    expect(el.querySelector('h1')?.textContent).toContain('Voltamos');
  });

  it('saída: a cortina cobre e o conteúdo some', async () => {
    const { f, el } = await mount(cfg());
    jasmine.clock().tick(500);
    await f.whenStable();
    f.componentRef.setInput('config', null);
    await f.whenStable();
    jasmine.clock().tick(500);
    await f.whenStable();
    expect(el.querySelector('.tela')).toBeNull();
  });

  it('título longo diminui sozinho', async () => {
    const { f, el } = await mount(cfg({ line1: 'Pausa para a premiação', line2: 'de todas as categorias' }));
    jasmine.clock().tick(500);
    await f.whenStable();
    const px = parseInt((el.querySelector('h1') as HTMLElement).style.fontSize, 10);
    expect(px).toBeLessThan(120);
  });
});
