import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { BolaoView } from './overlay-bolao';
import { OverlayBolaoComponent } from './overlay-bolao.component';

const view = (over: Partial<BolaoView> = {}): BolaoView => ({
  fase: 'aberto', a: { teamId: 'ta', label: 'Hölting Nilsson / Berger', count: 216, pct: 55 }, b: { teamId: 'tb', label: 'Batrane / Tiisaar', count: 179, pct: 45 },
  total: 395, restanteSeg: 209, court: 'Quadra 2', category: 'Masculino B', vencedor: null, acertaram: null, ...over,
});

async function mount(v: BolaoView | null) {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const f = TestBed.createComponent(OverlayBolaoComponent);
  f.componentRef.setInput('view', v);
  await f.whenStable();
  await new Promise((r) => setTimeout(r, 800)); // os números contam até o valor (0,7 s)
  await f.whenStable();
  return { f, el: f.nativeElement as HTMLElement };
}
const txt = (el: HTMLElement, sel: string) => el.querySelector(sel)?.textContent?.replace(/\s+/g, ' ').trim();

describe('OverlayBolaoComponent', () => {
  it('aberto: aba, % e palpites de cada dupla, total, barra, contagem e chamada pro app', async () => {
    const { el } = await mount(view());
    expect(txt(el, '.aba')).toContain('Palpites ao vivo · Quem leva?');
    expect(txt(el, '.lado--a .pct')).toBe('55%');
    expect(txt(el, '.lado--b .pct')).toBe('45%');
    expect(txt(el, '.lado--a .qtd')).toBe('216 palpites');
    expect(txt(el, '.lado--b .qtd')).toBe('179 palpites');
    expect(txt(el, '.total b')).toBe('395');
    expect(el.querySelectorAll('.lado--a .quem b').length).toBe(2);
    expect((el.querySelector('.disputa .a') as HTMLElement).style.width).toBe('55%');
    expect(txt(el, '.rodape')).toContain('Quadra 2');
    expect(txt(el, '.rodape')).toContain('Masculino B');
    expect(txt(el, '.rodape')).toContain('Palpites fecham em 3:29');
    expect(txt(el, '.rodape')).toContain('linktr.ee/nexago');
  });

  it('encerrado: aba branca, listras paradas e "Aguardando o fim da partida"', async () => {
    const { el } = await mount(view({ fase: 'encerrado', restanteSeg: null }));
    expect(txt(el, '.aba')).toContain('Palpites encerrados');
    expect(el.querySelector('.aba')?.classList.contains('aba--branca')).toBeTrue();
    expect(el.querySelector('.disputa')?.classList.contains('disputa--parada')).toBeTrue();
    expect(txt(el, '.rodape')).toContain('Aguardando o fim da partida');
  });

  it('resultado: vencedora com selo "Acertaram", a outra apagada e o resumo no rodapé', async () => {
    const { el } = await mount(view({ fase: 'resultado', restanteSeg: null, vencedor: 'A', acertaram: { n: 216, pct: 55 } }));
    expect(txt(el, '.aba')).toContain('Resultado dos palpites');
    expect(el.querySelector('.lado--a .selo')?.textContent).toContain('Acertaram');
    expect(el.querySelector('.lado--a')?.classList.contains('lado--vence')).toBeTrue();
    expect(el.querySelector('.lado--b')?.classList.contains('lado--apaga')).toBeTrue();
    expect(txt(el, '.rodape')).toContain('55% do público acertou');
    expect(txt(el, '.rodape')).toContain('216 palpites certos');
  });

  it('palpite novo: sobe um "+N" sobre a dupla e a contagem chega ao novo valor', async () => {
    const { f, el } = await mount(view());
    f.componentRef.setInput('view', view({ a: { teamId: 'ta', label: 'Hölting Nilsson / Berger', count: 218, pct: 55 }, total: 397 }));
    await f.whenStable();
    expect(txt(el, '.lado--a .mais')).toBe('+2');
    expect(el.querySelector('.lado--b .mais')).toBeNull();
    await new Promise((r) => setTimeout(r, 800));
    await f.whenStable();
    expect(txt(el, '.total b')).toBe('397');
    expect(txt(el, '.lado--a .qtd')).toBe('218 palpites');
  });

  it('1ª leitura não dispara "+N"; sem view, nada na tela', async () => {
    const { f, el } = await mount(view());
    expect(el.querySelector('.mais')).toBeNull();
    f.componentRef.setInput('view', null);
    await f.whenStable();
    expect(el.querySelector('.bl')).toBeNull();
  });
});
