import { provideZonelessChangeDetection, signal, type WritableSignal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { getApps, initializeApp } from 'firebase/app';
import { AuthService } from '../../auth/auth.service';
import { ArenaAccessService } from '../data/arena-access.service';
import { ArenaContextService } from '../data/arena-context.service';
import type { ArenaFiscalConfigView } from '../fiscal/fiscal.model';
import type { FiscalInvoiceItem } from './fiscal-invoice.model';
import { PanelFiscalInvoicesComponent } from './panel-fiscal-invoices.component';

/** Membros protegidos que o teste alimenta na mão — a lista real vem de uma leitura única no
 *  Firestore, que este teste nunca dispara (ver `contextStub`). */
interface InvoicesInternals {
  configLoading: WritableSignal<boolean>;
  config: WritableSignal<ArenaFiscalConfigView | null>;
  loading: WritableSignal<boolean>;
  invoices: WritableSignal<FiscalInvoiceItem[]>;
  retryError: WritableSignal<string | null>;
  retryingInvoiceIds: WritableSignal<Set<string>>;
}

function internals(fixture: ComponentFixture<PanelFiscalInvoicesComponent>): InvoicesInternals {
  return fixture.componentInstance as unknown as InvoicesInternals;
}

const CONFIG: ArenaFiscalConfigView = {
  cnpj: '12345678000199',
  razaoSocial: 'Arena X Ltda',
  inscricaoMunicipal: '123456',
  services: [{ id: 's1', codigoMunicipal: '3.03', descricao: 'Quadra', aliquotaIss: 2 }],
  defaultServiceIdBooking: 's1',
  defaultServiceIdClub: null,
  mode: 'always',
  status: 'active',
  statusMessage: null,
};

function rejectedInvoice(id: string): FiscalInvoiceItem {
  return {
    id,
    origin: 'booking',
    status: 'rejected',
    numero: null,
    valorBrutoReais: 100,
    tomadorNome: `Cliente ${id}`,
    tomadorDocumento: '390.533.447-05',
    pdfUrl: null,
    xmlUrl: null,
    errorMessage: 'Inscrição municipal inválida.',
    createdAt: new Date(),
  };
}

/** `arenaId` é uma função COMUM, não um signal: o `effect` do construtor lê o valor uma vez, vê
 *  `null` e retorna antes de tocar em `arenaFirestore()` — e, como não leu nada reativo, nunca
 *  reagenda. Depois disso o teste liga a arena, e só o caminho do callable (que o teste controla
 *  pelo `fetch`) fica de pé. Nenhuma ida real ao Firestore em nenhum momento. */
function contextStub(arenaIdRef: { value: string | null }) {
  return {
    arenaId: () => arenaIdRef.value,
    loading: () => false,
    notFound: () => false,
    arenaName: () => 'Arena X',
    managedArenas: () => [],
  };
}

/** Zoneless e sem zone.js: nada drena a fila de microtasks sozinho. */
async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  fixture.detectChanges();
  for (let i = 0; i < 50; i++) {
    await Promise.resolve();
  }
  fixture.detectChanges();
}

function retryButtons(fixture: ComponentFixture<unknown>): HTMLButtonElement[] {
  const host = fixture.nativeElement as HTMLElement;
  return Array.from(host.querySelectorAll('button')).filter((b) =>
    /Reemitir|Reemitindo/.test(b.textContent ?? ''),
  ) as HTMLButtonElement[];
}

function setup(arenaIdRef: { value: string | null }): ComponentFixture<PanelFiscalInvoicesComponent> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: ArenaContextService, useValue: contextStub(arenaIdRef) },
      { provide: ArenaAccessService, useValue: { isOwner: () => true, canRead: () => true } },
      { provide: AuthService, useValue: { user: signal({ email: 'dono@example.com' }) } },
    ],
  });

  const fixture = TestBed.createComponent(PanelFiscalInvoicesComponent);
  fixture.detectChanges(); // roda o effect ainda sem arena — nenhuma leitura remota

  const state = internals(fixture);
  state.configLoading.set(false);
  state.config.set(CONFIG);
  state.loading.set(false);
  state.invoices.set([rejectedInvoice('inv1'), rejectedInvoice('inv2')]);
  arenaIdRef.value = 'arena-1';
  fixture.detectChanges();
  return fixture;
}

describe('PanelFiscalInvoicesComponent — reemissão', () => {
  beforeAll(() => {
    // App de mentira só para o `arenaFunctions()` não subir o projeto real. O `fetch` está
    // dublado em todos os testes que chegam a esse caminho, então nada sai da máquina.
    if (getApps().length === 0) {
      initializeApp({
        apiKey: 'fake-api-key',
        projectId: 'demo-arena-spec',
        appId: '1:0:web:0',
        messagingSenderId: '0',
      });
    }
  });

  it('reemissões simultâneas: a segunda não reabilita o botão da primeira', async () => {
    // Requisição que nunca responde — as duas notas ficam "em voo" ao mesmo tempo, que é
    // exatamente o cenário que um rastreador escalar (um único id) não consegue representar.
    spyOn(window, 'fetch').and.returnValue(new Promise<Response>(() => {}));
    const fixture = setup({ value: null });

    expect(retryButtons(fixture).length).toBe(2);

    retryButtons(fixture)[0].click();
    await settle(fixture);
    expect(retryButtons(fixture)[0].disabled).withContext('primeira linha em voo').toBeTrue();
    expect(retryButtons(fixture)[0].textContent).toContain('Reemitindo…');
    expect(retryButtons(fixture)[1].disabled).withContext('segunda linha livre').toBeFalse();

    retryButtons(fixture)[1].click();
    await settle(fixture);

    expect(retryButtons(fixture)[0].disabled)
      .withContext('a primeira continua em voo depois do clique na segunda')
      .toBeTrue();
    expect(retryButtons(fixture)[1].disabled).toBeTrue();
    expect(internals(fixture).retryingInvoiceIds().size).toBe(2);
  });

  it('falha na reemissão mostra o erro SEM esconder a tabela de notas', async () => {
    const fetchSpy = spyOn(window, 'fetch').and.rejectWith(new Error('emissor fora do ar'));
    const fixture = setup({ value: null });

    retryButtons(fixture)[0].click();
    await settle(fixture);

    // Prova que o erro veio da chamada ao callable, e não de um tropeço antes dela.
    expect(fetchSpy).toHaveBeenCalled();
    expect(internals(fixture).retryError()).not.toBeNull();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.error-banner')).not.toBeNull();
    expect(host.querySelectorAll('.table-row').length)
      .withContext('o erro de reemissão é da LINHA, não do carregamento da lista')
      .toBe(2);
    expect(host.textContent).toContain('Cliente inv1');
  });

  it('nota não rejeitada não oferece reemissão', () => {
    const fixture = setup({ value: null });
    internals(fixture).invoices.set([
      { ...rejectedInvoice('inv1'), status: 'authorized', numero: '42' },
      rejectedInvoice('inv2'),
    ]);
    fixture.detectChanges();

    expect(retryButtons(fixture).length).toBe(1);
  });
});
