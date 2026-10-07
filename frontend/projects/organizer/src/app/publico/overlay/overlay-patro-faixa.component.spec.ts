import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { OverlayPatroFaixaComponent, patroFaixaVoltaSeg } from './overlay-patro-faixa.component';

const nomes = (n: number) => Array.from({ length: n }, (_, i) => ({ nome: `Patrocinador ${i + 1}`, logo: '' }));

async function mount(width: number, n: number) {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const fixture = TestBed.createComponent(OverlayPatroFaixaComponent);
  const palco = document.createElement('div');
  palco.style.cssText = `position:fixed;left:0;top:0;width:${width}px`;
  document.body.appendChild(palco);
  palco.appendChild(fixture.nativeElement);
  fixture.componentRef.setInput('itens', nomes(n));
  await fixture.whenStable();
  // O ResizeObserver mede depois do 1º layout.
  await new Promise((r) => setTimeout(r, 80));
  await fixture.whenStable();
  return { el: fixture.nativeElement as HTMLElement, palco };
}

describe('OverlayPatroFaixaComponent', () => {
  it('cabendo na largura: fica parada, sem cópia', async () => {
    const { el, palco } = await mount(1200, 3);
    expect(el.querySelector('.janela')?.classList.contains('rola')).toBeFalse();
    expect(el.querySelectorAll('.lista').length).toBe(1);
    expect(el.querySelectorAll('.logo').length).toBe(3);
    palco.remove();
  });

  it('passando da largura: vira carrossel com a lista duplicada (rolagem sem emenda)', async () => {
    const { el, palco } = await mount(400, 6);
    expect(el.querySelector('.janela')?.classList.contains('rola')).toBeTrue();
    expect(el.querySelectorAll('.lista').length).toBe(2);
    expect(el.querySelectorAll('.logo').length).toBe(12);
    expect(parseFloat(getComputedStyle(el.querySelector('.trilha') as HTMLElement).animationDuration)).toBeGreaterThanOrEqual(12);
    palco.remove();
  });

  it('o cartão acompanha a largura do conteúdo (logo mais largo = cartão mais largo)', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(OverlayPatroFaixaComponent);
    const palco = document.createElement('div');
    palco.style.cssText = 'position:fixed;left:0;top:0;width:1200px';
    document.body.appendChild(palco);
    palco.appendChild(fixture.nativeElement);
    const svg = (w: number) => `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='50'></svg>`;
    fixture.componentRef.setInput('itens', [{ nome: 'Estreito', logo: svg(50) }, { nome: 'Largo', logo: svg(250) }]);
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r, 120));
    const [a, b] = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.logo')).map((e) => e.getBoundingClientRect().width);
    expect(b!).toBeGreaterThan(a! * 2);
    palco.remove();
  });

  it('volta do carrossel: velocidade constante e piso de 12 s', () => {
    expect(patroFaixaVoltaSeg(300)).toBe(12);
    expect(patroFaixaVoltaSeg(1200)).toBe(20);
    expect(patroFaixaVoltaSeg(2400)).toBe(40);
  });
});
