import { Component, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { OgCardComponent } from './card.component';

@Component({
  imports: [OgCardComponent],
  template: `
    <og-card>conteúdo</og-card>
    <og-card pad="sm">conteúdo</og-card>
    <og-card pad="0"><div class="og-table-head"><span>Coluna</span></div></og-card>
    <og-card kicker="Movimentação" title="Extrato" pad="0">
      <div class="og-table-head"><span>Coluna</span></div>
    </og-card>
  `,
})
class HostComponent {}

/** `pad="0"` ficou um ano escrito como `padding: 10` — comprimento sem unidade, declaração
 *  inválida, descartada em silêncio pelo navegador. O card mantinha os 20px de `.og-card` e
 *  as 7 telas de tabela do painel saíam com recuo dobrado, sem nada acusar: build verde,
 *  teste verde, e o erro só aparecia olhando a tela. Estes testes leem o estilo COMPUTADO,
 *  que é o único jeito de pegar um valor que o CSS descartou. */
describe('OgCardComponent (recuo)', () => {
  let host: HTMLElement;

  beforeEach(async () => {
    // O portal roda zoneless (`provideZonelessChangeDetection` no app.config) e o alvo de teste
    // não carrega zone.js — sem isso o TestBed falha com NG0908.
    await TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    const fixture = TestBed.createComponent(HostComponent);
    await fixture.whenStable();
    host = fixture.nativeElement as HTMLElement;
  });

  function cards(): HTMLElement[] {
    return [...host.querySelectorAll('og-card')] as HTMLElement[];
  }

  it('cada variante de `pad` produz um recuo válido e diferente', () => {
    const [lg, sm, zero] = cards().map((c) => getComputedStyle(c).padding);

    expect(lg).toBe('20px');
    expect(sm).toBe('16px');
    expect(zero).toBe('0px');
  });

  it('com `pad="0"`, quem recua é o conteúdo — cabeçalho e tabela no mesmo prumo', () => {
    const card = cards()[3];
    const left = (el: Element | null) =>
      el ? Math.round(el.getBoundingClientRect().left - card.getBoundingClientRect().left) : null;

    // 1px de borda + 20px do recuo interno, nos dois
    expect(left(card.querySelector('.og-card-title'))).toBe(left(card.querySelector('.og-table-head span')));
  });
});
