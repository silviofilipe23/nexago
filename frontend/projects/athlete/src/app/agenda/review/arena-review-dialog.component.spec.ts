import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AuthService } from '../../auth/auth.service';
import type { ReviewableBooking } from '../../data/pending-arena-review';
import { ArenaReviewDialogComponent } from './arena-review-dialog.component';
import { REVIEW_IMPROVEMENT_TAGS, REVIEW_PRAISE_TAGS } from './arena-review-copy';

/** Destino do "Ver horários" no teste: sem rota, o router rejeita a navegação. */
@Component({ template: '' })
class StubPageComponent {}

const BOOKING: ReviewableBooking = {
  id: 'b1',
  arenaId: 'a1',
  arenaName: 'Arena Central',
  courtName: 'Quadra 2',
  courtId: 'c2',
  dateKey: '2026-04-15',
  startTime: '19:00',
  endTime: '20:30',
};

describe('ArenaReviewDialogComponent', () => {
  let fixture: ComponentFixture<ArenaReviewDialogComponent>;
  let host: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ArenaReviewDialogComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([{ path: '**', component: StubPageComponent }]), { provide: AuthService, useValue: { user: signal({ uid: 'u1' }) } }],
    }).compileComponents();

    fixture = TestBed.createComponent(ArenaReviewDialogComponent);
    fixture.componentRef.setInput('booking', BOOKING);
    fixture.detectChanges();
    host = fixture.nativeElement as HTMLElement;
  });

  function buttons(): HTMLButtonElement[] {
    return Array.from(host.querySelectorAll<HTMLButtonElement>('button'));
  }

  function button(label: string): HTMLButtonElement {
    const found = buttons().find((b) => b.textContent?.trim().replace(/^✓ /, '') === label);
    if (!found) throw new Error(`botão "${label}" não encontrado`);
    return found;
  }

  function star(n: number): HTMLButtonElement {
    return host.querySelectorAll<HTMLButtonElement>('.arv-star')[n - 1];
  }

  function chipLabels(): string[] {
    return Array.from(host.querySelectorAll<HTMLElement>('.arv-chip')).map((c) =>
      (c.textContent ?? '').trim().replace(/^✓ /, ''),
    );
  }

  function rate(n: number): void {
    star(n).click();
    fixture.detectChanges();
  }

  function setSent(rating: number): void {
    (fixture.componentInstance as unknown as { sentRating: { set(v: number): void } }).sentRating.set(rating);
    fixture.detectChanges();
  }

  it('abre sem nota, sem opções e com o CTA desligado em "Escolha uma nota"', () => {
    const cta = host.querySelector<HTMLButtonElement>('.arv-btn-primary')!;
    expect(cta.textContent?.trim()).toBe('Escolha uma nota');
    expect(cta.disabled).toBeTrue();
    expect(chipLabels()).toEqual([]);
    expect(host.querySelectorAll('.arv-star--filled').length).toBe(0);
    expect(star(1).getAttribute('tabindex')).toBe('0');
  });

  it('em nota 4–5 mostra "O que se destacou?" com as opções do app', () => {
    rate(5);
    expect(host.textContent).toContain('O QUE SE DESTACOU? · OPCIONAL');
    expect(chipLabels()).toEqual([...REVIEW_PRAISE_TAGS, 'Sim', 'Atrasou']);
    const cta = host.querySelector<HTMLButtonElement>('.arv-btn-primary')!;
    expect(cta.disabled).toBeFalse();
    expect(cta.textContent).toContain('Enviar avaliação');
  });

  it('em nota 1–3 mostra "O que pode melhorar?" e o rótulo em vermelho', () => {
    rate(2);
    expect(host.textContent).toContain('O QUE PODE MELHORAR? · OPCIONAL');
    expect(chipLabels()).toEqual([...REVIEW_IMPROVEMENT_TAGS, 'Sim', 'Atrasou']);
    expect(host.querySelector('.arv-rating-label--low')?.textContent?.trim()).toBe('Ruim');
    expect(host.textContent).toContain('Teve problema que atrapalhou o jogo');
  });

  it('mantém a seleção no mesmo tom e zera quando o tom vira', () => {
    rate(5);
    button('Atendimento').click();
    fixture.detectChanges();
    rate(4);
    expect(button('Atendimento').getAttribute('aria-pressed')).toBe('true');

    rate(3);
    expect(button('Atendimento').getAttribute('aria-pressed')).toBe('false');
  });

  it('responde a pontualidade com Sim/Atrasou e desmarca ao tocar de novo', () => {
    rate(5);
    expect(host.textContent).toContain('A QUADRA FOI LIBERADA NO HORÁRIO? · OPCIONAL');
    button('Atrasou').click();
    fixture.detectChanges();
    expect(button('Atrasou').getAttribute('aria-pressed')).toBe('true');
    expect(button('Sim').getAttribute('aria-pressed')).toBe('false');

    button('Atrasou').click();
    fixture.detectChanges();
    expect(button('Atrasou').getAttribute('aria-pressed')).toBe('false');
  });

  it('abre o comentário pelo link', () => {
    rate(4);
    expect(host.querySelector('textarea')).toBeNull();
    button('+ Escrever um comentário').click();
    fixture.detectChanges();
    expect(host.querySelector('textarea')?.getAttribute('maxlength')).toBe('500');
  });

  it('"Agora não" e Esc emitem dismissed antes do envio', () => {
    const dismissed = jasmine.createSpy('dismissed');
    const submitted = jasmine.createSpy('submitted');
    fixture.componentInstance.dismissed.subscribe(dismissed);
    fixture.componentInstance.submitted.subscribe(submitted);

    button('Agora não').click();
    host.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(dismissed).toHaveBeenCalledTimes(2);
    expect(submitted).not.toHaveBeenCalled();
  });

  it('nota 4–5 enviada: "Avaliação enviada" com "Jogar de novo" no mesmo dia da semana e horário', () => {
    rate(5);
    setSent(5);
    expect(host.querySelector('#arv-sent-title')?.textContent?.trim()).toBe('Avaliação enviada');
    expect(host.textContent).toContain('+10 XP no seu progresso');
    expect(host.textContent).toContain('Arena Central vai ver o que se destacou.');
    expect(host.textContent).toContain('JOGAR DE NOVO');
    expect(host.querySelector('.arv-rebook-where')?.textContent?.trim()).toBe('Quadra 2 · mesmo horário');

    const href = host.querySelector<HTMLAnchorElement>('.arv-rebook-cta')!.getAttribute('href') ?? '';
    expect(href).toContain('/reservar/a1/agendar?');
    expect(href).toContain('time=19:00');
    expect(href).toContain('courtId=c2');
    expect(href).toMatch(/date=\d{4}-\d{2}-\d{2}/);
    // Mesmo dia da semana do jogo (15/04/2026, quarta).
    expect(host.querySelector('.arv-rebook-when')?.textContent?.trim()).toMatch(/^Qua \d{2}\/\d{2} · 19:00$/);
  });

  it('nota 1–3 enviada: sem "Jogar de novo"', () => {
    rate(2);
    setSent(2);
    expect(host.textContent).toContain('A resposta dela aparece no perfil da arena.');
    expect(host.querySelector('.arv-rebook')).toBeNull();
  });

  it('depois do envio, Fechar, Esc e "Ver horários" concluem com submitted', () => {
    const dismissed = jasmine.createSpy('dismissed');
    const submitted = jasmine.createSpy('submitted');
    fixture.componentInstance.dismissed.subscribe(dismissed);
    fixture.componentInstance.submitted.subscribe(submitted);
    rate(5);
    setSent(5);

    button('Fechar').click();
    host.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    host.querySelector<HTMLAnchorElement>('.arv-rebook-cta')!.click();

    expect(submitted).toHaveBeenCalledTimes(3);
    expect(submitted).toHaveBeenCalledWith('b1');
    expect(dismissed).not.toHaveBeenCalled();
  });
});
