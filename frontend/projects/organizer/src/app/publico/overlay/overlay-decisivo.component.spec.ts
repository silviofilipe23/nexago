import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { DecisivoView } from './overlay-decisivo';
import { OverlayDecisivoComponent } from './overlay-decisivo.component';

const view = (over: Partial<DecisivoView> = {}): DecisivoView => ({
  kind: 'sp', salvo: false, side: 'A', n: 1, limite: null, court: 'Quadra 2', category: 'Masculino B', setNumber: 3, bestOf: 3, setsA: 1, setsB: 1,
  a: { teamId: 'ta', label: 'Hölting Nilsson / Berger', score: 14 }, b: { teamId: 'tb', label: 'Batrane / Tiisaar', score: 12 }, ...over,
});

async function mount(v: DecisivoView | null) {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const f = TestBed.createComponent(OverlayDecisivoComponent);
  f.componentRef.setInput('view', v);
  await f.whenStable();
  return { f, el: f.nativeElement as HTMLElement };
}
const titulo = (el: HTMLElement) => Array.from(el.querySelectorAll('h2 span')).map((s) => s.textContent).join('');

describe('OverlayDecisivoComponent', () => {
  it('set point: info com quadra, categoria, set e bolinhas; dupla A em destaque com a situação', async () => {
    const { el } = await mount(view());
    expect(el.querySelector('.info')?.textContent).toContain('Quadra 2');
    expect(el.querySelector('.info')?.textContent).toContain('Masculino B');
    expect(el.querySelector('.info')?.textContent).toContain('Set 3');
    expect(Array.from(el.querySelectorAll('.bolas u')).map((u) => u.className)).toEqual(['b-a', 'b-b', 'b-x']);
    expect(el.querySelector('.mini')?.textContent).toContain('Momento decisivo');
    expect(titulo(el)).toBe('Set point');
    expect(el.querySelector('.lado--a')?.classList.contains('lado--chance')).toBeTrue();
    expect(el.querySelector('.lado--b')?.classList.contains('lado--chance')).toBeFalse();
    expect(el.querySelector('.lado--a em')?.textContent).toContain('Set point');
    expect(el.querySelector('.lado--b em')?.textContent).toContain('Sets 1');
    expect(Array.from(el.querySelectorAll('.placar')).map((p) => p.textContent?.trim())).toEqual(['14', '12']);
    expect(el.querySelectorAll('.lado--a .nomes span').length).toBe(2);
    expect(el.querySelector('.borda-pulso')).not.toBeNull();
    expect(el.querySelector('.gira')).not.toBeNull();
  });

  it('match point repetido: "2º match point" e pulso mais rápido (classe dc--mp)', async () => {
    const { el } = await mount(view({ kind: 'mp', n: 2, side: 'B' }));
    expect(titulo(el)).toBe('Match point');
    expect(el.querySelector('.lado--b em')?.textContent).toContain('2º match point');
    expect(el.querySelector('.dc')?.classList.contains('dc--mp')).toBeTrue();
  });

  it('tie-break: "Até 15 pontos", sets no placar e ninguém em destaque', async () => {
    const { el } = await mount(view({ kind: 'tb', side: null, limite: 15, setsA: 1, setsB: 1 }));
    expect(el.querySelector('.info')?.textContent).toContain('Até 15 pontos');
    expect(el.querySelector('.bolas')).toBeNull();
    expect(el.querySelector('.mini')?.textContent).toContain('Set decisivo');
    expect(titulo(el)).toBe('Tie-break');
    expect(el.querySelectorAll('.lado--chance').length).toBe(0);
    expect(Array.from(el.querySelectorAll('.placar')).map((p) => p.textContent?.trim())).toEqual(['1', '1']);
  });

  it('salvo: "Salvo" no centro branco; borda de luz e pulso das bordas param', async () => {
    const { el } = await mount(view({ kind: 'mp', salvo: true }));
    expect(el.querySelector('.mini')?.textContent).toContain('Salvo');
    expect(titulo(el)).toBe('Match point');
    expect(el.querySelector('.dc')?.classList.contains('dc--salvo')).toBeTrue();
    expect(el.querySelector('.borda-pulso')).toBeNull();
    expect(el.querySelector('.gira')).toBeNull();
  });

  it('troca de estado com a faixa na tela re-anima só o miolo; sem view, nada na tela', async () => {
    const { f, el } = await mount(view());
    const faixa = el.querySelector('.faixa');
    f.componentRef.setInput('view', view({ kind: 'mp' }));
    await f.whenStable();
    expect(el.querySelector('.faixa')).toBe(faixa);
    f.componentRef.setInput('view', null);
    await f.whenStable();
    expect(el.querySelector('.dc')).toBeNull();
  });
});
