import { Component, provideZonelessChangeDetection, signal, type WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import type { TournamentWalletRow } from '../data/wallet-repository';
import { OgBellComponent } from '../shell/og-bell.component';
import { OgPageHeaderComponent } from '../ui/page-header.component';
import { FinanceiroComponent } from './financeiro.component';

/** `og-bell` de verdade abre `onSnapshot` contra o Firestore — sem sentido aqui. */
@Component({ selector: 'og-bell', template: '' })
class OgBellStub {}

interface Internals {
  loading: WritableSignal<boolean>;
  tournamentsLoading: WritableSignal<boolean>;
  caixas: WritableSignal<TournamentWalletRow[]>;
  selected: WritableSignal<TournamentWalletRow | null>;
}

function caixa(over: Partial<TournamentWalletRow> = {}): TournamentWalletRow {
  return {
    tournamentId: 't1',
    tournamentName: 'Copa Outubro',
    availableReais: 240,
    pendingReais: 0,
    awaitingSettlementReais: 0,
    ...over,
  };
}

/** Texto sem as quebras e o espaço não separável que o `Intl` põe em "R$ 1,00". */
function textOf(el: Element | null): string {
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

describe('FinanceiroComponent — "a liberar" do cartão', () => {
  let fixture: ComponentFixture<FinanceiroComponent>;

  async function mount(rows: TournamentWalletRow[]): Promise<HTMLElement> {
    TestBed.overrideComponent(OgPageHeaderComponent, { remove: { imports: [OgBellComponent] }, add: { imports: [OgBellStub] } });
    await TestBed.configureTestingModule({
      imports: [FinanceiroComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        // Sem usuário o construtor não chama a callable nem abre listener; o caixa é
        // semeado à mão, como chegaria de `loadOrganizerWalletView`.
        { provide: AuthService, useValue: { user: signal(null), isSuperAdmin: signal(false) } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(FinanceiroComponent);
    await fixture.whenStable();
    const internals = fixture.componentInstance as unknown as Internals;
    internals.caixas.set(rows);
    internals.selected.set(rows[0] ?? null);
    internals.loading.set(false);
    internals.tournamentsLoading.set(false);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('mostra o valor a liberar ao lado do saldo, com a explicação dos ~32 dias', async () => {
    const el = await mount([caixa({ awaitingSettlementReais: 115.23 })]);

    const bloco = el.querySelector('.og-fin-a-liberar');
    expect(bloco).not.toBeNull();
    expect(textOf(bloco?.querySelector('.og-fin-a-liberar-value') ?? null)).toContain('A liberar: R$ 115,23');
    expect(textOf(bloco)).toContain('cerca de 32 dias depois da aprovação');
    // O disponível não muda: o a liberar não é sacável.
    expect(textOf(el.querySelector('.og-kpi-value'))).toContain('R$ 240,00');
  });

  it('caixa sem cartão a caminho não mostra o bloco', async () => {
    const el = await mount([caixa()]);
    expect(el.querySelector('.og-fin-a-liberar')).toBeNull();
    expect(textOf(el)).not.toContain('A liberar');
  });

  it('com vários caixas, cada um mostra o próprio a liberar no seletor', async () => {
    const el = await mount([
      caixa({ tournamentId: 't1', tournamentName: 'Copa Outubro', awaitingSettlementReais: 88.71 }),
      caixa({ tournamentId: 't2', tournamentName: 'Copa Novembro', availableReais: 10 }),
    ]);

    const opcoes = Array.from(el.querySelectorAll('.og-fin-caixa'));
    expect(opcoes.length).toBe(2);
    expect(textOf(opcoes[0].querySelector('.liberar'))).toBe('R$ 88,71 a liberar');
    expect(opcoes[1].querySelector('.liberar')).toBeNull();
  });
});
