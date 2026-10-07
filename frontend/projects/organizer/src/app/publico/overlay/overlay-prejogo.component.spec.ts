import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { PrejogoCard } from '../../painel/data/broadcast-prejogo';
import { OverlayPrejogoComponent } from './overlay-prejogo.component';

const card: PrejogoCard = {
  matchId: 'm1', key: 'k', category: 'Duplas Masculino', phase: 'Semifinal', court: 'Quadra 1', rule: 'Melhor de 3 · 21 / 15', startTime: '15:40',
  a: { names: ['Andrade', 'Lacerda'], photos: [null, null], rankPos: 2, club: null },
  b: { names: ['Moraes', 'Teixeira'], photos: [null, null], rankPos: 5, club: null },
  h2h: null, last: [], rows: [],
};

const nomes = (n: number) => Array.from({ length: n }, (_, i) => ({ nome: `Patrocinador ${i + 1}`, logo: '' }));

async function mount(n: number) {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const f = TestBed.createComponent(OverlayPrejogoComponent);
  const palco = document.createElement('div');
  palco.style.cssText = 'position:fixed;left:0;top:0;width:1920px;height:1080px';
  document.body.appendChild(palco);
  palco.appendChild(f.nativeElement);
  f.componentRef.setInput('card', card);
  f.componentRef.setInput('sponsors', nomes(n));
  await f.whenStable();
  await new Promise((r) => setTimeout(r, 120)); // o ResizeObserver mede depois do 1º layout
  await f.whenStable();
  return { el: f.nativeElement as HTMLElement, palco };
}

describe('OverlayPrejogoComponent — patrocinadores', () => {
  it('poucos logos: ficam parados, sem carrossel', async () => {
    const { el, palco } = await mount(2);
    expect(el.querySelector('.patro .janela')?.classList.contains('rola')).toBeFalse();
    expect(el.querySelectorAll('.patro .logo').length).toBe(2);
    palco.remove();
  });

  it('logos além da área: o carrossel roda (lista duplicada) e a coluna NÃO estoura', async () => {
    const { el, palco } = await mount(12);
    const coluna = (el.querySelector('.patro') as HTMLElement).getBoundingClientRect();
    const rodape = (el.querySelector('.rodape') as HTMLElement).getBoundingClientRect();
    expect(el.querySelector('.patro .janela')?.classList.contains('rola')).toBeTrue();
    expect(el.querySelectorAll('.patro .lista').length).toBe(2);
    // a coluna do rodapé fica dentro do painel, mesmo com 12 logos
    expect(coluna.right).toBeLessThanOrEqual(rodape.right + 1);
    palco.remove();
  });
});
