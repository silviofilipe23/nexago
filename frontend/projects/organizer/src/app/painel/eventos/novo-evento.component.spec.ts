import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NovoEventoComponent } from './novo-evento.component';

/** Esta tela não tem lógica — o que ela tem é destino. Um `routerLink` errado leva a
 *  organizador nenhum, sem erro de build nem de runtime: a rota só não casa e a tela some.
 *  Como ela existe justamente porque a liga estava inalcançável, o teste guarda os destinos. */
describe('NovoEventoComponent (destinos)', () => {
  let host: HTMLElement;

  beforeEach(async () => {
    // O portal roda zoneless (`provideZonelessChangeDetection` no app.config) e o alvo de teste
    // não carrega zone.js — sem isso o TestBed falha com NG0908.
    await TestBed.configureTestingModule({
      imports: [NovoEventoComponent],
      providers: [provideZonelessChangeDetection(), provideRouter([])],
    }).compileComponents();
    const fixture = TestBed.createComponent(NovoEventoComponent);
    await fixture.whenStable();
    host = fixture.nativeElement as HTMLElement;
  });

  function hrefs(selector: string): string[] {
    return [...host.querySelectorAll(selector)].map((a) => a.getAttribute('href') ?? '');
  }

  it('oferece torneio e liga como formatos, nessa ordem', () => {
    const titles = [...host.querySelectorAll('.og-format-title')].map((el) => el.textContent!.trim());
    expect(titles).toEqual(['Torneio avulso', 'Liga / Circuito']);
  });

  it('leva cada formato ao seu wizard', () => {
    expect(hrefs('.og-format-card')).toEqual(['/painel/novo-torneio', '/painel/nova-liga']);
  });

  it('leva a ação secundária ao wizard de etapa', () => {
    expect(hrefs('.og-format-secondary')).toEqual(['/painel/nova-etapa']);
  });

  it('mostra "adicionar etapa" sem consultar as ligas do organizador', () => {
    // Decisão de projeto: a tela é estática. Se alguém passar a esconder o link para quem não
    // tem liga, vai precisar de uma leitura do Firestore aqui — e este teste é o aviso.
    expect(host.querySelector('.og-format-secondary')).not.toBeNull();
  });
});
