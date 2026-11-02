import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DEFAULT_BROADCAST_LANCES, type BroadcastLances } from '../../painel/data/broadcast-lances';
import { LANCE_SOM_PLAYER, OverlayLancesComponent, type LanceSom } from './overlay-lances.component';

class FakeSom implements LanceSom {
  volume = 1;
  currentTime = 7;
  tocando = false;
  bloqueado = false;
  play(): Promise<void> {
    if (this.bloqueado) return Promise.reject(new DOMException('sem clique', 'NotAllowedError'));
    this.tocando = true;
    return Promise.resolve();
  }
  pause(): void {
    this.tocando = false;
  }
}

describe('OverlayLancesComponent · som', () => {
  let sons: Map<string, FakeSom>;

  async function mount() {
    sons = new Map();
    TestBed.configureTestingModule({
      imports: [OverlayLancesComponent],
      providers: [
        provideZonelessChangeDetection(),
        {
          provide: LANCE_SOM_PLAYER,
          useValue: (src: string) => {
            const s = new FakeSom();
            sons.set(src, s);
            return s;
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(OverlayLancesComponent);
    const dispara = async (l: Partial<BroadcastLances>) => {
      fixture.componentRef.setInput('config', { ...DEFAULT_BROADCAST_LANCES, at: null, ...l });
      await fixture.whenStable();
    };
    await fixture.whenStable();
    return { fixture, dispara };
  }

  beforeEach(() => {
    jasmine.clock().install();
    jasmine.clock().mockDate(new Date(1_000_000));
  });
  afterEach(() => jasmine.clock().uninstall());

  it('cada lance toca o seu som do começo, e o próximo corta o anterior; Big Dig não tem som', async () => {
    const { dispara } = await mount();
    const block = sons.get('/sons/lances/monster-block.mp3')!;
    const ace = sons.get('/sons/lances/ace.mp3')!;
    await dispara({ seq: 1, tipo: 'dig' });
    expect([...sons.values()].some((s) => s.tocando)).toBeFalse();
    await dispara({ seq: 2, tipo: 'block' });
    expect(block.tocando).toBeTrue();
    expect(block.currentTime).toBe(0);
    await dispara({ seq: 3, tipo: 'ace' });
    expect(ace.tocando).toBeTrue();
    expect(ace.currentTime).toBe(0);
    expect(block.tocando).toBeFalse();
    await dispara({ seq: 4, tipo: 'fire' });
    expect(sons.get('/sons/lances/fire-ball.mp3')!.tocando).toBeTrue();
    expect(ace.tocando).toBeFalse();
  });

  it('tirar do ar some com o som num fade', async () => {
    const { dispara } = await mount();
    const som = sons.get('/sons/lances/monster-block.mp3')!;
    await dispara({ seq: 1, tipo: 'block' });
    await dispara({ seq: 2, tipo: null });
    jasmine.clock().tick(300);
    expect(som.tocando).toBeTrue();
    expect(som.volume).toBeLessThan(1);
    jasmine.clock().tick(400);
    expect(som.tocando).toBeFalse();
  });

  it('o som acompanha a tarja: sai junto quando ela sai', async () => {
    const { dispara } = await mount();
    const som = sons.get('/sons/lances/monster-block.mp3')!;
    await dispara({ seq: 1, tipo: 'block', seg: 4 });
    jasmine.clock().tick(2250 + 4000 - 10);
    expect(som.tocando).toBeTrue();
    jasmine.clock().tick(10 + 700);
    expect(som.tocando).toBeFalse();
  });

  it('aba sem clique: avisa que o som foi bloqueado e o clique liga o som do lance que está passando', async () => {
    const { fixture, dispara } = await mount();
    const el = fixture.nativeElement as HTMLElement;
    const som = sons.get('/sons/lances/monster-block.mp3')!;
    som.bloqueado = true;
    await dispara({ seq: 1, tipo: 'block' });
    await Promise.resolve();
    fixture.detectChanges();
    const aviso = el.querySelector('button.som') as HTMLButtonElement;
    expect(aviso?.textContent).toContain('clique para ligar');
    som.bloqueado = false;
    aviso.click();
    fixture.detectChanges();
    expect(som.tocando).toBeTrue();
    expect(el.querySelector('button.som')).toBeNull();
  });
});
