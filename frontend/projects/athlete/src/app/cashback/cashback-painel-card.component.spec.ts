import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CashbackService } from '../data/cashback.service';
import { fakeCashbackService, type FakeCashbackService } from '../../testing/cashback-service.fake';
import { CashbackPainelCardComponent } from './cashback-painel-card.component';

function text(el: Element | null | undefined): string {
  return el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

describe('CashbackPainelCardComponent', () => {
  function render(fake: FakeCashbackService): ComponentFixture<CashbackPainelCardComponent> {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: CashbackService, useValue: fake.asService() },
      ],
    });
    const fixture = TestBed.createComponent(CashbackPainelCardComponent);
    fixture.detectChanges();
    return fixture;
  }

  function card(fixture: ComponentFixture<CashbackPainelCardComponent>): HTMLAnchorElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector('a.cpc-card');
  }

  it('aparece com o recurso ligado e saldo: total, detalhe e link para /cashback', () => {
    const fixture = render(fakeCashbackService({ wallet: { availableCents: 1000, pendingCents: 240 } }));
    expect(card(fixture)?.getAttribute('href')).toBe('/cashback');
    expect(text(card(fixture)?.querySelector('.cpc-total'))).toBe('R$ 12,40 de cashback');
    expect(text(card(fixture)?.querySelector('.cpc-detail'))).toBe('R$ 10,00 disponível · R$ 2,40 pendente');
  });

  it('só com pendente também aparece', () => {
    const fixture = render(fakeCashbackService({ wallet: { pendingCents: 240 } }));
    expect(text(card(fixture)?.querySelector('.cpc-detail'))).toBe('R$ 0,00 disponível · R$ 2,40 pendente');
  });

  it('some sem saldo', () => {
    const fixture = render(fakeCashbackService());
    expect(card(fixture)).toBeNull();
  });

  it('some com o recurso desligado, mesmo com saldo', () => {
    const fixture = render(fakeCashbackService({ config: { enabled: false }, wallet: { availableCents: 1240 } }));
    expect(card(fixture)).toBeNull();
  });

  it('aparece quando o saldo chega depois (listener ao vivo)', () => {
    const fake = fakeCashbackService();
    const fixture = render(fake);
    expect(card(fixture)).toBeNull();
    fake.wallet.update((w) => ({ ...w, pendingCents: 240 }));
    fixture.detectChanges();
    expect(card(fixture)).not.toBeNull();
  });
});
