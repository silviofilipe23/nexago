import { Component, input, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { MINUS_SIGN, type CashbackLedgerEntry } from '../data/cashback-model';
import { CashbackService } from '../data/cashback.service';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';
import { fakeCashbackService, type FakeCashbackService } from '../../testing/cashback-service.fake';
import { AthleteCashbackComponent } from './athlete-cashback.component';

/** A casca do portal monta o menu e ouve convites — abriria WebChannel do Firestore no Karma. */
@Component({ selector: 'app-at-panel-shell', template: '<ng-content />' })
class PanelShellStubComponent {
  readonly userName = input('Atleta');
}

function entry(id: string, type: CashbackLedgerEntry['type'], createdAt: Date, amountCents = 240): CashbackLedgerEntry {
  return { id, type, amountCents, label: 'Reserva · Arena Sol · 12/10', createdAt };
}

function text(el: Element | null | undefined): string {
  return el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

describe('AthleteCashbackComponent', () => {
  let fake: FakeCashbackService;

  function render(): HTMLElement {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: AuthService, useValue: { user: signal({ uid: 'ana', displayName: 'Ana' }) } },
        { provide: CashbackService, useValue: fake.asService() },
      ],
    }).overrideComponent(AthleteCashbackComponent, {
      remove: { imports: [AtPanelShellComponent] },
      add: { imports: [PanelShellStubComponent] },
    });
    const fixture = TestBed.createComponent(AthleteCashbackComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('herói: disponível em destaque, pendente e próximo vencimento', () => {
    fake = fakeCashbackService({
      wallet: { availableCents: 1240, pendingCents: 240, nextExpiryAt: new Date(2027, 2, 12), nextExpiryCents: 320 },
    });
    const host = render();
    expect(text(host.querySelector('.cb-available'))).toBe('R$ 12,40');
    expect(text(host.querySelector('.cb-hero'))).toContain('Pendente R$ 2,40 · libera depois do jogo');
    expect(text(host.querySelector('.cb-hero'))).toContain('R$ 3,20 vencem em 12/03');
  });

  it('sem saldo preso num pagamento não mostra "Reservado"', () => {
    fake = fakeCashbackService({ wallet: { availableCents: 1240 } });
    expect(text(render().querySelector('.cb-hero'))).not.toContain('Reservado');
  });

  it('com saldo preso num pagamento mostra "Reservado"', () => {
    fake = fakeCashbackService({ wallet: { availableCents: 1240, heldCents: 1500 } });
    expect(text(render().querySelector('.cb-hero'))).toContain('Reservado R$ 15,00 · em um pagamento em andamento');
  });

  it('"Como funciona" tem as 5 linhas com os números da config', () => {
    fake = fakeCashbackService({ config: { ratePercent: 3, expiryMonths: 12, minCashCents: 700 } });
    const items = Array.from(render().querySelectorAll('.cb-how li')).map((li) => text(li));
    expect(items.length).toBe(5);
    expect(items[0]).toBe('Ganhe até 3% de volta em reservas, inscrições e clubinho pagos pelo app.');
    expect(items[2]).toBe('Vale por 12 meses depois de liberado.');
    expect(items[3]).toBe(
      'Use como desconto no próximo pagamento pelo app — sempre fica um mínimo de R$ 7,00 no PIX.',
    );
    expect(items[4]).toBe('Não pode ser sacado nem transferido.');
  });

  it('extrato agrupado por mês, com sinal por tipo e o sufixo "pendente" no ganho', () => {
    fake = fakeCashbackService({
      ledger: [
        entry('a', 'release', new Date(2026, 10, 2, 10, 0)),
        entry('b', 'earn', new Date(2026, 9, 12, 19, 0)),
        entry('c', 'redeem', new Date(2026, 9, 5, 9, 0), 1500),
      ],
    });
    const host = render();
    expect(Array.from(host.querySelectorAll('.cb-month')).map((h) => text(h))).toEqual([
      'novembro de 2026',
      'outubro de 2026',
    ]);
    expect(Array.from(host.querySelectorAll('.cb-row-value')).map((v) => text(v))).toEqual([
      '+R$ 2,40',
      '+R$ 2,40',
      `${MINUS_SIGN}R$ 15,00`,
    ]);
    const suffixes = host.querySelectorAll('.cb-row-suffix');
    expect(suffixes.length).toBe(1);
    expect(text(suffixes[0])).toBe('pendente');
    expect(text(host.querySelectorAll('.cb-row-title')[2])).toBe('Usado no pagamento');
  });

  it('estado vazio com a taxa da config', () => {
    fake = fakeCashbackService({ config: { ratePercent: 2 } });
    expect(text(render().querySelector('.cb-empty'))).toBe(
      'Você ainda não tem cashback. Pague reservas, inscrições e clubinho pelo app e ganhe até 2% de volta.',
    );
  });

  it('recurso desligado: a página continua mostrando o saldo já ganho', () => {
    fake = fakeCashbackService({ config: { enabled: false }, wallet: { availableCents: 1240 } });
    expect(text(render().querySelector('.cb-available'))).toBe('R$ 12,40');
  });

  it('erro no extrato não vira "você ainda não tem cashback"', () => {
    fake = fakeCashbackService();
    fake.ledgerError.set(true);
    expect(text(render().querySelector('.cb-empty'))).toContain('Não foi possível carregar o extrato');
  });

  it('carteira ainda carregando mostra o loading, não R$ 0,00', () => {
    fake = fakeCashbackService();
    fake.walletLoaded.set(false);
    const host = render();
    expect(host.querySelector('app-nx-page-loading')).not.toBeNull();
    expect(host.querySelector('.cb-available')).toBeNull();
  });
});
