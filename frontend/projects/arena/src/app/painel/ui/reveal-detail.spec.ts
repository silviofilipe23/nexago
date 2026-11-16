import { ApplicationRef, Component, ElementRef, Injector, inject, provideZonelessChangeDetection, signal, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { detailNeedsReveal, revealDetailAfterRender } from './reveal-detail';

describe('detailNeedsReveal', () => {
  it('rola quando o detalhe começa abaixo da faixa útil da tela (lista empilhada no celular)', () => {
    expect(detailNeedsReveal(1400, 812)).toBeTrue();
    expect(detailNeedsReveal(600, 812)).toBeTrue();
  });

  it('não rola quando o detalhe já está à vista (desktop lado a lado)', () => {
    expect(detailNeedsReveal(120, 800)).toBeFalse();
    expect(detailNeedsReveal(480, 800)).toBeFalse();
  });

  it('não rola para cima quando o topo do detalhe está acima da tela', () => {
    expect(detailNeedsReveal(-300, 800)).toBeFalse();
  });

  it('não rola sem altura de tela (aba escondida)', () => {
    expect(detailNeedsReveal(900, 0)).toBeFalse();
  });
});

@Component({
  template: `<div [style.height.px]="gap()"></div><div #detail>detalhe</div>`,
})
class RevealHostComponent {
  readonly gap = signal(0);
  private readonly injector = inject(Injector);
  readonly detail = viewChild.required<ElementRef<HTMLElement>>('detail');

  pick(): void {
    revealDetailAfterRender(this.injector, () => this.detail());
  }
}

describe('revealDetailAfterRender', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] }));

  function setup(gap: number) {
    const fixture = TestBed.createComponent(RevealHostComponent);
    fixture.componentInstance.gap.set(gap);
    fixture.detectChanges();
    const scroll = spyOn(fixture.componentInstance.detail().nativeElement, 'scrollIntoView');
    return { fixture, scroll };
  }

  it('rola até o detalhe que ficou abaixo da tela depois do render', () => {
    const { fixture, scroll } = setup(window.innerHeight * 2);
    fixture.componentInstance.pick();
    expect(scroll).not.toHaveBeenCalled(); // só depois do render
    TestBed.inject(ApplicationRef).tick();
    expect(scroll).toHaveBeenCalledOnceWith(jasmine.objectContaining({ block: 'start' }));
  });

  it('não rola quando o detalhe já está à vista', () => {
    const { fixture, scroll } = setup(0);
    fixture.componentInstance.pick();
    TestBed.inject(ApplicationRef).tick();
    expect(scroll).not.toHaveBeenCalled();
  });
});
