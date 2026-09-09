import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SorteioConfigComponent } from './sorteio-config.component';

/**
 * `id` e `catId` chegam do ROUTER, via `withComponentInputBinding()` — que só
 * preenche `input()`, nunca um `signal()` comum.
 *
 * Declarar os dois como signal fazia a tela ficar presa em "Carregando…" para
 * sempre: sem os parâmetros, o efeito de carga saía na primeira linha e
 * `loading` nunca era desligado. O sintoma não dizia nada sobre a causa, então
 * o teste trava exatamente a fiação.
 */
async function render() {
  await TestBed.configureTestingModule({
    imports: [SorteioConfigComponent],
    providers: [provideZonelessChangeDetection(), provideRouter([])],
  }).compileComponents();
  return TestBed.createComponent(SorteioConfigComponent);
}

describe('SorteioConfigComponent — parâmetros de rota', () => {
  it('aceita `id` e `catId` como inputs do router', async () => {
    const fixture = await render();

    // `setInput` estoura quando a propriedade não é um input declarado — é
    // exatamente o que acontecia com `signal('')`.
    expect(() => {
      fixture.componentRef.setInput('id', 'torneio-1');
      fixture.componentRef.setInput('catId', 'categoria-1');
    }).not.toThrow();
  });

  it('sem parâmetros, não fica presa em "Carregando…" — explica o que houve', async () => {
    const fixture = await render();
    await fixture.whenStable();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('Carregando…');
  });
});
