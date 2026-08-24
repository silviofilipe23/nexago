import { provideZonelessChangeDetection, signal, type WritableSignal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { ArenaAccessService } from '../data/arena-access.service';
import { ArenaContextService } from '../data/arena-context.service';
import type { ArenaFiscalConfigView, FiscalConfigStatus } from './fiscal.model';
import { PanelFiscalComponent } from './panel-fiscal.component';

/** Membros protegidos que o teste precisa manipular — o passo 5 só existe depois que a config
 *  chega, e neste teste ela chega pela mão em vez de pelo listener do Firestore. */
interface FiscalInternals {
  configLoading: WritableSignal<boolean>;
  config: WritableSignal<ArenaFiscalConfigView | null>;
  currentStep: WritableSignal<number>;
  maxVisitedStep: WritableSignal<number>;
  emitTestInvoice: () => Promise<void>;
}

function internals(fixture: ComponentFixture<PanelFiscalComponent>): FiscalInternals {
  return fixture.componentInstance as unknown as FiscalInternals;
}

function configView(status: FiscalConfigStatus): ArenaFiscalConfigView {
  return {
    cnpj: '12345678000199',
    razaoSocial: 'Arena X Ltda',
    inscricaoMunicipal: '123456',
    services: [{ id: 's1', codigoMunicipal: '3.03', descricao: 'Quadra', aliquotaIss: 2 }],
    defaultServiceIdBooking: 's1',
    defaultServiceIdClub: null,
    mode: 'off',
    status,
    statusMessage: status === 'error' ? 'Inscrição municipal inválida.' : null,
  };
}

/** `arenaId` é uma função COMUM, não um signal: o `effect` do construtor lê esse valor e, vendo
 *  `null`, retorna antes de tocar em `arenaFirestore()`. Como nada reativo foi lido, o efeito não
 *  reagenda — o componente renderiza sem nenhuma ida à rede. */
function contextStub() {
  return {
    arenaId: () => null,
    loading: () => false,
    notFound: () => false,
    arenaName: () => 'Arena X',
    managedArenas: () => [],
  };
}

function setup(status: FiscalConfigStatus): ComponentFixture<PanelFiscalComponent> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: ArenaContextService, useValue: contextStub() },
      { provide: ArenaAccessService, useValue: { isOwner: () => true, canRead: () => true } },
      { provide: AuthService, useValue: { user: signal({ email: 'dono@example.com' }) } },
    ],
  });

  const fixture = TestBed.createComponent(PanelFiscalComponent);
  const state = internals(fixture);
  state.configLoading.set(false);
  state.config.set(configView(status));
  state.maxVisitedStep.set(5);
  state.currentStep.set(5);
  fixture.detectChanges();
  return fixture;
}

function primaryButton(fixture: ComponentFixture<PanelFiscalComponent>): HTMLButtonElement {
  const host = fixture.nativeElement as HTMLElement;
  const button = Array.from(host.querySelectorAll('button.ar-mini-btn-primary')).find((b) =>
    /Emitir nota de teste|Tentar novamente/.test(b.textContent ?? ''),
  );
  expect(button).withContext('o passo 5 precisa oferecer o botão de emissão').toBeDefined();
  return button as HTMLButtonElement;
}

describe('PanelFiscalComponent — botão de ativação do passo 5', () => {
  it('status "testing" oferece "Emitir nota de teste" e o clique chama emitTestInvoice', () => {
    const fixture = setup('testing');
    const spy = spyOn(internals(fixture), 'emitTestInvoice').and.resolveTo();

    const button = primaryButton(fixture);
    expect(button.textContent).toContain('Emitir nota de teste');
    expect(button.textContent).not.toContain('Tentar novamente');

    button.click();
    expect(spy).toHaveBeenCalled();
  });

  it('status "error" oferece "Tentar novamente" — mesmo método, é reemissão da MESMA nota', () => {
    const fixture = setup('error');
    const spy = spyOn(internals(fixture), 'emitTestInvoice').and.resolveTo();

    const button = primaryButton(fixture);
    expect(button.textContent).toContain('Tentar novamente');
    expect(button.textContent).not.toContain('Emitir nota de teste');

    button.click();
    expect(spy).toHaveBeenCalled();
  });

  it('status "active" não oferece mais emissão de teste — só o seletor de modo', () => {
    const fixture = setup('active');
    const host = fixture.nativeElement as HTMLElement;

    expect(host.textContent).not.toContain('Emitir nota de teste');
    expect(host.textContent).not.toContain('Tentar novamente');
    expect(host.textContent).toContain('Nota de teste aprovada');
  });
});
