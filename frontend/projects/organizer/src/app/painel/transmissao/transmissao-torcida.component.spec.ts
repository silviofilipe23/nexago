import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LANCE_SOM_PLAYER, type LanceSom } from '../../publico/overlay/overlay-lances.component';
import { TransmissaoTorcidaComponent } from './transmissao-torcida.component';

class FakeSom implements LanceSom {
  volume = 1;
  currentTime = 9;
  tocando = false;
  play(): Promise<void> {
    this.tocando = true;
    return Promise.resolve();
  }
  pause(): void {
    this.tocando = false;
  }
}

describe('TransmissaoTorcidaComponent', () => {
  let sons: Map<string, FakeSom>;

  async function mount() {
    sons = new Map();
    TestBed.configureTestingModule({
      imports: [TransmissaoTorcidaComponent],
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
    const fixture = TestBed.createComponent(TransmissaoTorcidaComponent);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const botao = (nome: string) => [...el.querySelectorAll<HTMLButtonElement>('.og-tc-som')].find((b) => b.textContent?.includes(nome))!;
    return { fixture, el, botao };
  }

  beforeEach(() => jasmine.clock().install());
  afterEach(() => jasmine.clock().uninstall());

  it('mostra os três sons com a duração', async () => {
    const { el } = await mount();
    const nomes = [...el.querySelectorAll('.og-tc-som b')].map((b) => b.textContent?.trim());
    expect(nomes).toEqual(['What a Rally', 'Set / Match point', 'Clap your hands']);
    expect(el.querySelector('.og-tc-som small')?.textContent).toBe('46 s');
  });

  it('um toque toca do começo, outro toque para', async () => {
    const { fixture, botao } = await mount();
    botao('What a Rally').click();
    await fixture.whenStable();
    const som = sons.get('/sons/torcida/what-a-rally.mp3')!;
    expect(som.tocando).toBeTrue();
    expect(som.currentTime).toBe(0);
    expect(botao('What a Rally').getAttribute('aria-pressed')).toBe('true');
    botao('What a Rally').click();
    await fixture.whenStable();
    expect(som.tocando).toBeFalse();
    expect(botao('What a Rally').getAttribute('aria-pressed')).toBe('false');
  });

  it('tocar outro corta o que estava tocando', async () => {
    const { fixture, botao } = await mount();
    botao('What a Rally').click();
    botao('Clap your hands').click();
    await fixture.whenStable();
    expect(sons.get('/sons/torcida/what-a-rally.mp3')!.tocando).toBeFalse();
    expect(sons.get('/sons/torcida/clap-your-hands.mp3')!.tocando).toBeTrue();
  });

  it('o botão solta sozinho quando o som acaba', async () => {
    const { fixture, botao } = await mount();
    botao('Clap your hands').click();
    jasmine.clock().tick(17_900 + 10);
    await fixture.whenStable();
    expect(botao('Clap your hands').getAttribute('aria-pressed')).toBe('false');
  });
});
