import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { StoreBanner } from '../data/store-showcase-model';
import { LojaBannerComponent } from './loja-banner.component';

/** GIF de 1px: foto de verdade sem ir à rede; o fragmento distingue as fotos. */
const PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

function banner(id: string, over: Partial<StoreBanner> = {}): StoreBanner {
  return {
    id,
    kicker: '',
    title: `Campanha ${id}`,
    subtitle: '',
    imageUrl: `${PIXEL}#${id}`,
    primary: { label: 'Ver coleção', collectionId: 'verao-2026' },
    secondary: null,
    startDate: null,
    endDate: null,
    ...over,
  };
}

const THREE = [banner('a', { subtitle: 'Frete grátis acima de R$ 199.' }), banner('b', { imageUrl: null }), banner('c')];

describe('LojaBannerComponent', () => {
  let fixture: ComponentFixture<LojaBannerComponent>;
  let host: HTMLElement;

  function mount(list: StoreBanner[]): void {
    TestBed.configureTestingModule({
      imports: [LojaBannerComponent],
      providers: [provideZonelessChangeDetection()],
    });
    fixture = TestBed.createComponent(LojaBannerComponent);
    fixture.componentRef.setInput('banners', list);
    fixture.detectChanges();
    host = fixture.nativeElement as HTMLElement;
  }

  const slides = () => [...host.querySelectorAll<HTMLElement>('.lj-banner-slide')];
  const dots = () => [...host.querySelectorAll<HTMLButtonElement>('.lj-banner-dot')];
  /** Índice do banner no ar, conferido no texto, na foto e no indicador ao mesmo tempo. */
  function shown(): number {
    const on = slides().findIndex((s) => s.classList.contains('lj-banner-slide--on'));
    const dot = dots().findIndex((d) => d.getAttribute('aria-selected') === 'true');
    expect(dot).withContext('indicador acompanha o banner').toBe(on);
    return on;
  }

  afterEach(() => jasmine.clock().uninstall());

  it('empilha os banners e só o do ar fica alcançável; os outros ficam inert', () => {
    mount(THREE);
    expect(slides().length).toBe(3);
    expect(shown()).toBe(0);
    const [first, second, third] = slides();
    expect(first!.inert).toBeFalse();
    expect(first!.getAttribute('aria-hidden')).toBeNull();
    expect(first!.getAttribute('aria-label')).toBe('1 de 3: Campanha a');
    for (const hidden of [second!, third!]) {
      expect(hidden.inert).toBeTrue();
      expect(hidden.getAttribute('aria-hidden')).toBe('true');
    }
    // Banner sem foto não ganha <img>: a coluna mostra o fundo listrado da marca.
    const imgs = [...host.querySelectorAll('.lj-banner-img')];
    expect(imgs.map((i) => i.getAttribute('src'))).toEqual([`${PIXEL}#a`, `${PIXEL}#c`]);
    expect(imgs.map((i) => i.classList.contains('lj-banner-img--on'))).toEqual([true, false]);
    expect(host.querySelector('.lj-banner')!.getAttribute('aria-label')).toBe('Campanhas da loja');
  });

  it('o indicador troca o banner, a foto e o foco de teclado (tabindex)', () => {
    mount(THREE);
    dots()[2]!.click();
    fixture.detectChanges();
    expect(shown()).toBe(2);
    expect(host.querySelectorAll('.lj-banner-img')[1]!.classList).toContain('lj-banner-img--on');
    expect(slides()[0]!.inert).toBeTrue();
    expect(slides()[2]!.inert).toBeFalse();
    expect(dots().map((d) => d.tabIndex)).toEqual([-1, -1, 0]);
  });

  it('setas, Home e End no seletor trocam com volta e levam o foco ao indicador', () => {
    mount(THREE);
    const tablist = host.querySelector<HTMLElement>('[role="tablist"]')!;
    const press = (key: string) => {
      tablist.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
      fixture.detectChanges();
    };
    press('ArrowLeft');
    expect(shown()).toBe(2);
    expect(document.activeElement).toBe(dots()[2]!);
    press('ArrowRight');
    expect(shown()).toBe(0);
    press('End');
    expect(shown()).toBe(2);
    press('Home');
    expect(shown()).toBe(0);
    press('a');
    expect(shown()).toBe(0);
  });

  it('troca sozinho a cada 6 s; parado com o mouse em cima; clique reinicia a contagem', () => {
    jasmine.clock().install();
    mount(THREE);
    jasmine.clock().tick(5999);
    fixture.detectChanges();
    expect(shown()).toBe(0);
    jasmine.clock().tick(1);
    fixture.detectChanges();
    expect(shown()).toBe(1);

    host.dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();
    jasmine.clock().tick(20000);
    fixture.detectChanges();
    expect(shown()).toBe(1);
    host.dispatchEvent(new MouseEvent('mouseleave'));
    fixture.detectChanges();

    jasmine.clock().tick(5000);
    dots()[0]!.click();
    fixture.detectChanges();
    jasmine.clock().tick(5000);
    fixture.detectChanges();
    expect(shown()).withContext('o clique zerou os 6 s').toBe(0);
    jasmine.clock().tick(1000);
    fixture.detectChanges();
    expect(shown()).toBe(1);
  });

  it('os botões do banner no ar emitem o banner', () => {
    mount([banner('a', { secondary: { label: 'Kits', categoryId: 'kits', url: null } }), banner('b')]);
    const primary = jasmine.createSpy('primary');
    const secondary = jasmine.createSpy('secondary');
    fixture.componentInstance.primaryClick.subscribe(primary);
    fixture.componentInstance.secondaryClick.subscribe(secondary);
    slides()[0]!.querySelector<HTMLButtonElement>('.lj-btn--primary')!.click();
    slides()[0]!.querySelector<HTMLButtonElement>('.lj-btn--ghost')!.click();
    expect(primary).toHaveBeenCalledOnceWith(jasmine.objectContaining({ id: 'a' }));
    expect(secondary).toHaveBeenCalledOnceWith(jasmine.objectContaining({ id: 'a' }));
  });

  it('um banner só: sem indicadores e sem rotação', () => {
    jasmine.clock().install();
    mount([banner('a')]);
    expect(dots().length).toBe(0);
    expect(slides()[0]!.classList).toContain('lj-banner-slide--on');
    expect(slides()[0]!.getAttribute('aria-label')).toBe('Campanha a');
    expect(host.querySelector('.lj-banner')!.getAttribute('aria-label')).toBe('Campanha: Campanha a');
    jasmine.clock().tick(12000);
    fixture.detectChanges();
    expect(slides()[0]!.classList).toContain('lj-banner-slide--on');
  });

  it('lista que encolhe com o índice lá na frente mostra o último que sobrou', () => {
    mount(THREE);
    dots()[2]!.click();
    fixture.detectChanges();
    fixture.componentRef.setInput('banners', THREE.slice(0, 2));
    fixture.detectChanges();
    expect(shown()).toBe(1);
  });
});
