import { provideZonelessChangeDetection, signal, type WritableSignal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { getApps, initializeApp } from 'firebase/app';
import { AuthService } from '../../auth/auth.service';
import { ArenaAccessService } from '../data/arena-access.service';
import { ArenaContextService } from '../data/arena-context.service';
import { PanelWeatherRequestsComponent } from './panel-weather-requests.component';
import { weatherRequestFromDoc, type WeatherRequest } from './weather.model';

interface RequestsInternals {
  requests: WritableSignal<WeatherRequest[]>;
  loading: WritableSignal<boolean>;
}

interface Rendered {
  fixture: ComponentFixture<PanelWeatherRequestsComponent>;
  arenaIdRef: { value: string | null };
}

const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000);

const REQUESTS: WeatherRequest[] = [
  weatherRequestFromDoc('b1', {
    arenaId: 'a1', athleteName: 'Rafael Souza', courtName: 'Quadra 2', date: '2026-10-28', startTime: '18:00', endTime: '19:00',
    paidReais: 70, note: 'Começou a chover forte às 17:40.', status: 'pending', createdAt: minutesAgo(12),
    weather: { probability: 90, precipitationMm: 5.4 },
  }),
  weatherRequestFromDoc('b2', {
    arenaId: 'a1', athleteName: 'Pedro Henrique', courtName: 'Quadra 3', date: '2026-10-28', startTime: '21:00', endTime: '22:00',
    paidReais: 60, status: 'pending', createdAt: minutesAgo(60), weather: { probability: 20, precipitationMm: 0.3 },
  }),
  weatherRequestFromDoc('b3', {
    arenaId: 'a1', athleteName: 'Sem Medição', courtName: 'Quadra 1', date: '2026-10-28', startTime: '20:00', endTime: '21:00',
    paidReais: 60, status: 'pending', createdAt: minutesAgo(90), weather: null,
  }),
  weatherRequestFromDoc('b4', {
    arenaId: 'a1', athleteName: 'Júlia Andrade', courtName: 'Quadra 1', date: '2026-10-28', startTime: '19:00', endTime: '20:00',
    paidReais: 70, status: 'approved', autoApproved: true, createdAt: minutesAgo(40), weather: { probability: 85, precipitationMm: 4.8 },
  }),
  weatherRequestFromDoc('b5', {
    arenaId: 'a1', athleteName: 'Caio Mendes', courtName: 'Quadra 4', date: '2026-10-27', startTime: '20:00', endTime: '21:00',
    paidReais: 70, status: 'rejected', rejectReason: 'Quadra coberta', createdAt: minutesAgo(600),
  }),
  weatherRequestFromDoc('b6', { arenaId: 'a1', athleteName: 'Desistiu', status: 'withdrawn', createdAt: minutesAgo(5) }),
];

function render(canWrite = true, policy: Record<string, unknown> = { enabled: true, trigger: 'request' }): Rendered {
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
          arenaDocData: signal({ weatherPolicy: policy }),
        },
      },
      { provide: ArenaAccessService, useValue: { isOwner: () => canWrite, canRead: () => true, canWrite: () => canWrite } },
      { provide: AuthService, useValue: { user: signal({ email: 'dono@example.com' }), signOutUser: async () => {} } },
    ],
  });
  const fixture = TestBed.createComponent(PanelWeatherRequestsComponent);
  fixture.detectChanges();
  const s = fixture.componentInstance as unknown as RequestsInternals;
  s.requests.set(REQUESTS);
  s.loading.set(false);
  fixture.detectChanges();
  return { fixture, arenaIdRef };
}

function el(fixture: ComponentFixture<unknown>): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

function text(node: Element | null | undefined): string {
  return node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

/** Valor de uma linha "rótulo · valor" (`.wx-line`) dos cards de detalhe. */
function lineValue(fixture: ComponentFixture<unknown>, label: string): string {
  const line = Array.from(el(fixture).querySelectorAll('.wx-line')).find((l) => text(l.children[0]) === label);
  return text(line?.querySelector('.v'));
}

function rows(fixture: ComponentFixture<unknown>): HTMLButtonElement[] {
  return Array.from(el(fixture).querySelectorAll<HTMLButtonElement>('button.req-row'));
}

function tab(fixture: ComponentFixture<unknown>, label: string): HTMLButtonElement {
  return Array.from(el(fixture).querySelectorAll<HTMLButtonElement>('button[role="tab"]')).find((t) => text(t).startsWith(label))!;
}

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  fixture.detectChanges();
  for (let i = 0; i < 50; i++) await Promise.resolve();
  await new Promise((r) => setTimeout(r));
  fixture.detectChanges();
}

describe('PanelWeatherRequestsComponent', () => {
  it('abas com contagem (sem os retirados) e lista dos pendentes', () => {
    const { fixture } = render();

    expect(text(tab(fixture, 'Pendentes'))).toBe('Pendentes3');
    expect(text(tab(fixture, 'Aprovadas'))).toBe('Aprovadas1');
    expect(text(tab(fixture, 'Recusadas'))).toBe('Recusadas1');
    expect(rows(fixture).length).toBe(3);
    expect(text(rows(fixture)[0])).toContain('há 12 min');
    expect(text(rows(fixture)[0])).toContain('Q2 · Qua 28 Out · 18:00');
  });

  it('chuva no horário: azul a partir de 2 mm, "sem dado" sem medição', () => {
    const { fixture } = render();
    const cells = Array.from(el(fixture).querySelectorAll('.rain-cell'));

    expect(text(cells[0])).toContain('5,4 mm');
    expect(cells[0]!.classList).toContain('rained');
    expect(text(cells[1])).toContain('0,3 mm');
    expect(cells[1]!.classList).not.toContain('rained');
    expect(text(cells[2])).toContain('sem dado');
  });

  it('detalhe do selecionado: observação, clima e o que acontece ao aprovar', () => {
    const { fixture } = render(true, { enabled: true, trigger: 'request', allowReschedule: false });
    const page = text(el(fixture));

    expect(page).toContain('“Começou a chover forte às 17:40.”');
    expect(page).toContain('5,4 mm/h');
    expect(page).toContain('Chuva forte · 90% no período');
    expect(lineValue(fixture, 'O atleta escolhe')).toBe('Crédito');
    expect(lineValue(fixture, 'Sem resposta em 24h')).toBe('Crédito automático');
    expect(lineValue(fixture, 'Valor pago')).toMatch(/^R\$\s70,00$/);

    rows(fixture)[2]!.click();
    fixture.detectChanges();
    expect(text(el(fixture))).toContain('Sem medição para este horário.');
    expect(text(el(fixture))).toContain('Sem observação do atleta.');
    expect(rows(fixture)[2]!.classList).toContain('selected');
  });

  it('aprovadas mostram "Automático"; recusadas, o motivo', () => {
    const { fixture } = render();
    tab(fixture, 'Aprovadas').click();
    fixture.detectChanges();
    expect(rows(fixture).length).toBe(1);
    expect(text(rows(fixture)[0])).toContain('Automático');
    expect(lineValue(fixture, 'Situação')).toBe('Aprovada automaticamente');
    expect(el(fixture).querySelector('button.approve-btn')).toBeNull();

    tab(fixture, 'Recusadas').click();
    fixture.detectChanges();
    expect(lineValue(fixture, 'Motivo')).toBe('Quadra coberta');
  });

  it('"Aprovar todas com chuva registrada" conta só os pendentes com ≥ 2 mm', () => {
    const { fixture } = render();
    const bulk = el(fixture).querySelector('button.bulk-btn') as HTMLButtonElement;

    expect(text(bulk.querySelector('.bulk-count'))).toBe('1');
    expect(bulk.disabled).toBeFalse();
  });

  it('gatilho "arena" explica por que não chegam pedidos', () => {
    const { fixture } = render(true, { enabled: true, trigger: 'arena' });
    expect(text(el(fixture).querySelector('.trigger-hint'))).toContain('Os atletas só conseguem pedir');
  });

  it('sem escrita em agenda: nada de decidir', () => {
    const { fixture } = render(false);

    expect((el(fixture).querySelector('button.approve-btn') as HTMLButtonElement).disabled).toBeTrue();
    expect((el(fixture).querySelector('button.reject-btn') as HTMLButtonElement).disabled).toBeTrue();
    expect((el(fixture).querySelector('button.bulk-btn') as HTMLButtonElement).disabled).toBeTrue();
  });

  describe('decidir', () => {
    beforeAll(() => {
      if (getApps().length === 0) {
        initializeApp({ apiKey: 'fake-api-key', projectId: 'demo-arena-spec', appId: '1:0:web:0', messagingSenderId: '0' });
      }
    });

    function spyCallable(): Array<{ url: string; data: Record<string, unknown> }> {
      const calls: Array<{ url: string; data: Record<string, unknown> }> = [];
      spyOn(window, 'fetch').and.callFake(async (input: RequestInfo | URL, init?: RequestInit) => {
        const data = (JSON.parse(String(init?.body ?? '{}')) as { data: Record<string, unknown> }).data;
        calls.push({ url: String(input), data });
        return new Response(JSON.stringify({ result: { status: data['approve'] ? 'approved' : 'rejected' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      });
      return calls;
    }

    it('recusar abre o modal e manda o motivo', async () => {
      const calls = spyCallable();
      const { fixture, arenaIdRef } = render();
      arenaIdRef.value = 'arena-1';

      (el(fixture).querySelector('button.reject-btn') as HTMLButtonElement).click();
      fixture.detectChanges();
      const reason = el(fixture).querySelector('textarea.reject-reason') as HTMLTextAreaElement;
      reason.value = 'Não choveu no horário';
      reason.dispatchEvent(new Event('input'));
      (el(fixture).querySelector('button.confirm-reject') as HTMLButtonElement).click();
      await settle(fixture);

      expect(calls.length).toBe(1);
      expect(calls[0]!.url).toContain('decideArenaWeatherRequest');
      expect(calls[0]!.data).toEqual({ arenaId: 'arena-1', bookingId: 'b1', approve: false, reason: 'Não choveu no horário' });
      expect(el(fixture).querySelector('ar-modal')).toBeNull();
      expect(text(el(fixture).querySelector('.notice'))).toContain('recusado');
    });

    it('aprovar todas com chuva registrada pede confirmação e aprova uma a uma', async () => {
      const calls = spyCallable();
      const { fixture, arenaIdRef } = render();
      arenaIdRef.value = 'arena-1';

      (el(fixture).querySelector('button.bulk-btn') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(calls.length).withContext('nada antes de confirmar').toBe(0);
      (el(fixture).querySelector('button.confirm-bulk') as HTMLButtonElement).click();
      await settle(fixture);

      expect(calls.map((c) => c.data)).toEqual([{ arenaId: 'arena-1', bookingId: 'b1', approve: true }]);
      expect(text(el(fixture).querySelector('.notice'))).toContain('1 pedido aprovado');
    });
  });
});
