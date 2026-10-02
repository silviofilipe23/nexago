import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CashbackService } from '../data/cashback.service';
import { fakeCashbackService, type FakeCashbackService } from '../../testing/cashback-service.fake';
import { CashbackEarnedNoteComponent } from './cashback-earned-note.component';

/** Pai de mentira: a tela de sucesso passa o `paymentId` da cobrança. */
@Component({
  standalone: true,
  imports: [CashbackEarnedNoteComponent],
  template: `<app-cashback-earned-note [paymentId]="paymentId()" />`,
})
class HostComponent {
  readonly paymentId = signal<string | null>('pay_1');
}

function text(el: Element | null | undefined): string {
  return el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

describe('CashbackEarnedNoteComponent', () => {
  async function render(fake: FakeCashbackService): Promise<ComponentFixture<HostComponent>> {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: CashbackService, useValue: fake.asService() },
      ],
    });
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  }

  function note(fixture: ComponentFixture<HostComponent>): HTMLElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector('.cen-note');
  }

  it('lote pendente chegando: "+R$ X de cashback pendente" com link para /cashback', async () => {
    const fake = fakeCashbackService();
    const fixture = await render(fake);
    expect(fake.lotIds).toEqual(['pay_1']);

    fake.lotListener!({ id: 'pay_1', status: 'pending', earnedCents: 240, remainingCents: 240, label: 'Reserva' });
    fixture.detectChanges();

    const earned = (fixture.nativeElement as HTMLElement).querySelector('a.cen-note--earned');
    expect(text(earned)).toBe('+R$ 2,40 de cashback pendente · libera depois do jogo');
    expect(earned?.getAttribute('href')).toBe('/cashback');
  });

  it('sem lote e recurso ligado: nota genérica com link para Meu cashback', async () => {
    const fixture = await render(fakeCashbackService());
    expect(text(note(fixture))).toBe('Pagamentos pelo app geram cashback — veja em Meu cashback');
    expect(note(fixture)?.querySelector('a')?.getAttribute('href')).toBe('/cashback');
  });

  it('sem lote e recurso desligado: nada', async () => {
    const fixture = await render(fakeCashbackService({ config: { enabled: false } }));
    expect(note(fixture)).toBeNull();
  });

  it('lote cancelado não vira "pendente"', async () => {
    const fake = fakeCashbackService({ config: { enabled: false } });
    const fixture = await render(fake);
    fake.lotListener!({ id: 'pay_1', status: 'cancelled', earnedCents: 240, remainingCents: 0, label: '' });
    fixture.detectChanges();
    expect(note(fixture)).toBeNull();
  });

  it('trocar o paymentId para o listener anterior; sem id não ouve nada', async () => {
    const fake = fakeCashbackService();
    const fixture = await render(fake);

    fixture.componentInstance.paymentId.set('pay_2');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fake.lotIds).toEqual(['pay_1', 'pay_2']);
    expect(fake.lotStops).toBe(1);

    fixture.componentInstance.paymentId.set(null);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fake.lotStops).toBe(2);
    expect(fake.lotIds).toEqual(['pay_1', 'pay_2']);
  });

  it('sair da tela para o listener do lote', async () => {
    const fake = fakeCashbackService();
    const fixture = await render(fake);
    fixture.destroy();
    expect(fake.lotStops).toBe(1);
  });
});
