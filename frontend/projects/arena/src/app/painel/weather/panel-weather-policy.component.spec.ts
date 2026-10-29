import { provideZonelessChangeDetection, signal, type WritableSignal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { getApps, initializeApp } from 'firebase/app';
import { AuthService } from '../../auth/auth.service';
import type { ArenaCourt } from '../courts/court.model';
import { ArenaAccessService } from '../data/arena-access.service';
import { ArenaContextService } from '../data/arena-context.service';
import { PanelWeatherPolicyComponent } from './panel-weather-policy.component';
import type { WeatherPolicy } from './weather.model';

/** Sinais protegidos que o teste alimenta na mão. `arenaId` é função comum (não signal): o
 *  `effect` das quadras lê `null` uma vez e nunca reagenda, então nada vai ao Firestore. */
interface PolicyInternals {
  courts: WritableSignal<ArenaCourt[]>;
  policy: WritableSignal<WeatherPolicy>;
}

interface Rendered {
  fixture: ComponentFixture<PanelWeatherPolicyComponent>;
  doc: WritableSignal<Record<string, unknown> | null>;
  arenaIdRef: { value: string | null };
}

function court(id: string, name: string): ArenaCourt {
  return { id, name, types: [], typeLabels: [], status: 'active', basePricePerHourReais: 60 };
}

function render(canWrite = true, initialDoc: Record<string, unknown> | null = null): Rendered {
  const doc = signal<Record<string, unknown> | null>(initialDoc);
  const arenaIdRef: { value: string | null } = { value: null };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      {
        provide: ArenaContextService,
        useValue: {
          arenaId: () => arenaIdRef.value,
          loading: () => false,
          notFound: () => false,
          arenaName: () => 'Arena CFC',
          managedArenas: () => [],
          arenaDocData: doc,
        },
      },
      { provide: ArenaAccessService, useValue: { isOwner: () => canWrite, canRead: () => true, canWrite: () => canWrite } },
      { provide: AuthService, useValue: { user: signal({ email: 'dono@example.com' }), signOutUser: async () => {} } },
    ],
  });
  const fixture = TestBed.createComponent(PanelWeatherPolicyComponent);
  fixture.detectChanges();
  return { fixture, doc, arenaIdRef };
}

function el(fixture: ComponentFixture<unknown>): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

function internals(fixture: ComponentFixture<PanelWeatherPolicyComponent>): PolicyInternals {
  return fixture.componentInstance as unknown as PolicyInternals;
}

function buttonByText(fixture: ComponentFixture<unknown>, text: string, selector = 'button'): HTMLButtonElement {
  const found = Array.from(el(fixture).querySelectorAll<HTMLButtonElement>(selector)).find((b) => b.textContent?.trim() === text);
  if (!found) throw new Error(`botão "${text}" não encontrado`);
  return found;
}

function switchByLabel(fixture: ComponentFixture<unknown>, label: string): HTMLButtonElement {
  const found = el(fixture).querySelector<HTMLButtonElement>(`button[role="switch"][aria-label="${label}"]`);
  if (!found) throw new Error(`switch "${label}" não encontrado`);
  return found;
}

function saveButton(fixture: ComponentFixture<unknown>): HTMLButtonElement {
  return el(fixture).querySelector('button.save-btn') as HTMLButtonElement;
}

function summaryText(fixture: ComponentFixture<unknown>): string {
  return Array.from(el(fixture).querySelectorAll('.wx-line'))
    .map((l) => Array.from(l.children).map((c) => c.textContent?.trim()).join(' '))
    .join(' | ');
}

/** Zoneless e sem zone.js: nada drena a fila de microtasks sozinho. */
async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  fixture.detectChanges();
  for (let i = 0; i < 50; i++) await Promise.resolve();
  await new Promise((r) => setTimeout(r));
  fixture.detectChanges();
}

describe('PanelWeatherPolicyComponent', () => {
  it('sem política salva mostra os padrões e o salvar travado', () => {
    const { fixture } = render();

    expect(switchByLabel(fixture, 'Cancelamento por chuva sem custo').getAttribute('aria-checked')).toBe('false');
    expect(buttonByText(fixture, '30 dias', 'button.reschedule-chip').classList).toContain('active');
    expect(buttonByText(fixture, 'Validade 90 dias', 'button.validity-chip').classList).toContain('active');
    expect(el(fixture).querySelector('button[role="radio"][aria-checked="true"]')?.textContent).toContain('A arena ativa o Modo chuva');
    expect(saveButton(fixture).disabled).toBeTrue();
    expect(el(fixture).querySelector('.preview-title')?.textContent).toContain('Desligado');
  });

  it('crédito fica sempre ligado e o Pix aparece desligado como "Em breve"', () => {
    const { fixture } = render();

    const credit = switchByLabel(fixture, 'Guardar como crédito (sempre ligado)');
    expect(credit.getAttribute('aria-checked')).toBe('true');
    expect(credit.disabled).toBeTrue();
    const refund = switchByLabel(fixture, 'Reembolso no Pix (em breve)');
    expect(refund.getAttribute('aria-checked')).toBe('false');
    expect(refund.disabled).toBeTrue();
    expect(el(fixture).textContent).toContain('Em breve');
    expect(el(fixture).textContent).toContain('é o destino de');
  });

  it('segue o doc vivo da arena enquanto não há edição', () => {
    const { fixture, doc } = render();
    doc.set({ weatherPolicy: { enabled: true, rescheduleDays: 60, creditValidityDays: null, trigger: 'auto' } });
    fixture.detectChanges();

    expect(switchByLabel(fixture, 'Cancelamento por chuva sem custo').getAttribute('aria-checked')).toBe('true');
    expect(buttonByText(fixture, '60 dias', 'button.reschedule-chip').classList).toContain('active');
    expect(buttonByText(fixture, 'Sem validade', 'button.validity-chip').classList).toContain('active');
    expect(summaryText(fixture)).toContain('Aciona Automático pela previsão');
    expect(el(fixture).querySelector('.preview-text')?.textContent).toContain('remarca em até 60 dias');
    expect(saveButton(fixture).disabled).toBeTrue();
  });

  it('editar libera o salvar; Descartar volta ao salvo; doc vivo não atropela rascunho', () => {
    const { fixture, doc } = render();
    buttonByText(fixture, 'Até 2h antes').click();
    fixture.detectChanges();

    expect(saveButton(fixture).disabled).toBeFalse();
    expect(summaryText(fixture)).toContain('Prazo Até 2h antes');

    doc.set({ weatherPolicy: { enabled: true } });
    fixture.detectChanges();
    expect(internals(fixture).policy().requestDeadline).withContext('rascunho preservado').toBe('before_2h');

    buttonByText(fixture, 'Descartar').click();
    fixture.detectChanges();
    expect(internals(fixture).policy().requestDeadline).toBe('start');
    expect(saveButton(fixture).disabled).toBeTrue();
  });

  it('desligar remarcar trava os prazos de remarcação', () => {
    const { fixture } = render();
    switchByLabel(fixture, 'Remarcar sem custo').click();
    fixture.detectChanges();

    const chips = Array.from(el(fixture).querySelectorAll<HTMLButtonElement>('button.reschedule-chip'));
    expect(chips.length).toBe(3);
    expect(chips.every((c) => c.disabled)).toBeTrue();
    expect(summaryText(fixture)).toContain('Remarcar Desligado');
  });

  it('quadras: todas marcadas por padrão; desmarcar a coberta grava a lista; nenhuma trava o salvar', () => {
    const { fixture } = render();
    internals(fixture).courts.set([court('c1', 'Quadra 1'), court('c2', 'Quadra 2'), court('c3', 'Quadra 3'), court('c4', 'Quadra 4')]);
    fixture.detectChanges();

    const chips = () => Array.from(el(fixture).querySelectorAll<HTMLButtonElement>('button.court-chip'));
    expect(chips().every((c) => c.classList.contains('active'))).toBeTrue();
    expect(summaryText(fixture)).toContain('Quadras 4 de 4');
    expect(el(fixture).textContent).toContain('Desmarque as quadras cobertas');

    chips()[3]!.click();
    fixture.detectChanges();
    expect(internals(fixture).policy().courtIds).toEqual(['c1', 'c2', 'c3']);
    expect(summaryText(fixture)).toContain('Quadras 3 de 4');

    chips()[3]!.click();
    fixture.detectChanges();
    expect(internals(fixture).policy().courtIds).withContext('todas de novo = null').toBeNull();

    for (const c of chips()) c.click();
    fixture.detectChanges();
    expect(el(fixture).querySelector('.field-error')?.textContent).toContain('Marque ao menos uma quadra');
    expect(saveButton(fixture).disabled).toBeTrue();
  });

  it('sem escrita em agenda: tudo travado e aviso de leitura', () => {
    const { fixture } = render(false);

    expect(el(fixture).querySelector('.info-banner')?.textContent).toContain('não alterar');
    expect(switchByLabel(fixture, 'Cancelamento por chuva sem custo').disabled).toBeTrue();
    expect(Array.from(el(fixture).querySelectorAll<HTMLButtonElement>('button.ar-chip')).every((c) => c.disabled)).toBeTrue();
    expect(Array.from(el(fixture).querySelectorAll<HTMLButtonElement>('button[role="radio"]')).every((r) => r.disabled)).toBeTrue();
    expect(saveButton(fixture).disabled).toBeTrue();
  });

  describe('salvar', () => {
    beforeAll(() => {
      // App de mentira só para `arenaFunctions()` não subir o projeto real; o `fetch` é dublado.
      if (getApps().length === 0) {
        initializeApp({ apiKey: 'fake-api-key', projectId: 'demo-arena-spec', appId: '1:0:web:0', messagingSenderId: '0' });
      }
    });

    it('manda a política para saveArenaWeatherPolicy e adota a normalizada', async () => {
      let sentUrl = '';
      let sentBody: { data?: { arenaId?: string; policy?: WeatherPolicy } } = {};
      spyOn(window, 'fetch').and.callFake(async (input: RequestInfo | URL, init?: RequestInit) => {
        sentUrl = String(input);
        sentBody = JSON.parse(String(init?.body ?? '{}'));
        const policy = { ...sentBody.data!.policy!, rescheduleDays: 15 };
        return new Response(JSON.stringify({ result: { policy } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      });
      const { fixture, arenaIdRef } = render();
      arenaIdRef.value = 'arena-1';
      switchByLabel(fixture, 'Cancelamento por chuva sem custo').click();
      fixture.detectChanges();
      saveButton(fixture).click();
      await settle(fixture);

      expect(sentUrl).toContain('saveArenaWeatherPolicy');
      expect(sentBody.data?.arenaId).toBe('arena-1');
      expect(sentBody.data?.policy?.enabled).toBeTrue();
      expect(internals(fixture).policy().rescheduleDays).withContext('resposta do servidor vale').toBe(15);
      expect(el(fixture).querySelector('.notice')?.textContent).toContain('Política salva');
      expect(saveButton(fixture).disabled).toBeTrue();
    });

    it('callable não publicada (404) vira mensagem legível', async () => {
      spyOn(window, 'fetch').and.callFake(async () => new Response('Not Found', { status: 404 }));
      const { fixture, arenaIdRef } = render();
      arenaIdRef.value = 'arena-1';
      buttonByText(fixture, 'Não se aplica').click();
      fixture.detectChanges();
      saveButton(fixture).click();
      await settle(fixture);

      expect(el(fixture).querySelector('.error-banner')?.textContent).toContain('Recurso ainda não publicado no servidor');
      expect(saveButton(fixture).disabled).withContext('rascunho continua para tentar de novo').toBeFalse();
    });
  });
});
