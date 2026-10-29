import { provideZonelessChangeDetection, signal, type WritableSignal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { getApps, initializeApp } from 'firebase/app';
import { AuthService } from '../../auth/auth.service';
import type { ArenaCourt } from '../courts/court.model';
import { ArenaAccessService } from '../data/arena-access.service';
import { ArenaContextService } from '../data/arena-context.service';
import { PanelWeatherRainModeComponent } from './panel-weather-rain-mode.component';
import {
  dateKeyFrom,
  rainModePreviewFromData,
  type RainModeEvent,
  type RainModePreview,
  type WeatherForecast,
} from './weather.model';

/** Sinais protegidos que o teste alimenta na mão. `arenaId` é função comum: os `effect`s de
 *  quadras, previsão, eventos e prévia leem `null` e retornam antes de ir ao servidor. */
interface RainModeInternals {
  courts: WritableSignal<ArenaCourt[]>;
  forecast: WritableSignal<WeatherForecast | null>;
  forecastLoaded: WritableSignal<boolean>;
  preview: WritableSignal<RainModePreview | null>;
  events: WritableSignal<RainModeEvent[]>;
  startHour: WritableSignal<number>;
  endHour: WritableSignal<number>;
  date: WritableSignal<string>;
}

interface Rendered {
  fixture: ComponentFixture<PanelWeatherRainModeComponent>;
  doc: WritableSignal<Record<string, unknown> | null>;
  arenaIdRef: { value: string | null };
}

const ENABLED_DOC = { name: 'Arena CFC', city: 'Aparecida de Goiânia', weatherPolicy: { enabled: true, courtIds: ['c1', 'c2'] } };

function court(id: string, name: string): ArenaCourt {
  return { id, name, types: [], typeLabels: [], status: 'active', basePricePerHourReais: 60 };
}

const PREVIEW = rainModePreviewFromData({
  bookings: [
    { bookingId: 'b1', athleteId: 'u1', athleteName: 'Enzo Ribeiro', courtId: 'c1', courtName: 'Quadra 1', startTime: '17:00', endTime: '18:00', paidReais: 60, paymentLabel: 'Pix', treatment: 'release', creditableReais: 60, fraction: 1 },
    { bookingId: 'b2', athleteId: 'u2', athleteName: 'Marina Lopes', courtId: 'c2', courtName: 'Quadra 2', startTime: '16:30', endTime: '18:00', paidReais: 90, paymentLabel: 'Cartão', treatment: 'partial', creditableReais: 60, fraction: 0.6667 },
    { bookingId: 'b3', athleteId: 'u1', athleteName: 'Enzo Ribeiro', courtId: 'c2', courtName: 'Quadra 2', startTime: '18:30', endTime: '19:30', paidReais: 0, paymentLabel: 'Na arena', treatment: 'cancel', creditableReais: 0, fraction: 1 },
    { bookingId: 'b4', athleteId: null, athleteName: 'Clubinho Terça', courtId: 'c1', courtName: 'Quadra 1', startTime: '19:00', endTime: '20:00', paidReais: 0, paymentLabel: 'Mensal', treatment: 'manual', manualReason: 'club', creditableReais: 0, fraction: 0 },
  ],
  totals: { release: 1, partial: 1, cancel: 1, manual: 1, creditableReais: 120 },
});

function render(canWrite = true, initialDoc: Record<string, unknown> | null = ENABLED_DOC): Rendered {
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
  const fixture = TestBed.createComponent(PanelWeatherRainModeComponent);
  fixture.detectChanges();
  return { fixture, doc, arenaIdRef };
}

function el(fixture: ComponentFixture<unknown>): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

function internals(fixture: ComponentFixture<PanelWeatherRainModeComponent>): RainModeInternals {
  return fixture.componentInstance as unknown as RainModeInternals;
}

function activateButton(fixture: ComponentFixture<unknown>): HTMLButtonElement {
  return el(fixture).querySelector('button.activate-btn') as HTMLButtonElement;
}

function withPreview(r: Rendered): Rendered {
  const s = internals(r.fixture);
  s.courts.set([court('c1', 'Quadra 1'), court('c2', 'Quadra 2'), court('c3', 'Quadra 3')]);
  s.preview.set(PREVIEW);
  r.fixture.detectChanges();
  return r;
}

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  fixture.detectChanges();
  for (let i = 0; i < 50; i++) await Promise.resolve();
  await new Promise((r) => setTimeout(r));
  fixture.detectChanges();
}

describe('PanelWeatherRainModeComponent', () => {
  it('política desligada: banner com link para a Política e ativação travada', () => {
    const r = withPreview(render(true, { name: 'Arena CFC' }));
    const banner = el(r.fixture).querySelector('.policy-off');

    expect(banner?.textContent).toContain('Cancelamento por chuva desligado');
    expect(banner?.querySelector('a')?.getAttribute('href')).toBe('/painel/agenda/chuva/politica');
    expect(activateButton(r.fixture).disabled).toBeTrue();
  });

  it('lista as reservas afetadas com o tratamento de cada uma', () => {
    const { fixture } = withPreview(render());
    const rows = Array.from(el(fixture).querySelectorAll('.affected-row')).map((row) => row.textContent?.replace(/\s+/g, ' ').trim() ?? '');

    expect(rows.length).toBe(4);
    expect(rows[0]).toContain('Marina Lopes');
    expect(rows[0]).toMatch(/R\$\s60,00 \(proporcional\)/);
    expect(rows[1]).toContain('Enzo Ribeiro');
    expect(rows[1]).toContain('Pix');
    expect(rows[2]).toContain('Não pago');
    expect(rows[2]).toContain('Só cancela');
    expect(rows[3]).toContain('Tratar à parte');
    expect(rows[3]).toContain('Clubinho');
    expect(el(fixture).textContent).toContain('4 reservas');
  });

  it('impacto e botão contam atletas distintos avisados', () => {
    const { fixture } = withPreview(render());
    const impact = el(fixture).querySelector('.creditable')?.textContent ?? '';

    expect(impact).toMatch(/R\$\s120,00/);
    expect(el(fixture).textContent).toContain('Nada sai do caixa. Quem não escolher em 24h recebe o crédito automaticamente.');
    expect(activateButton(fixture).textContent).toContain('Ativar e avisar 2 atletas');
    expect(activateButton(fixture).disabled).toBeFalse();
  });

  it('quadras: padrão = as da política; a de fora aparece marcada como tal', () => {
    const { fixture } = withPreview(render());
    const chips = Array.from(el(fixture).querySelectorAll<HTMLButtonElement>('button.court-chip'));

    expect(chips.map((c) => c.textContent?.trim())).toEqual(['Q1', 'Q2', 'Q3 · fora da política']);
    expect(chips.map((c) => c.classList.contains('active'))).toEqual([true, true, false]);

    chips[2]!.click();
    chips[0]!.click();
    fixture.detectChanges();
    const after = Array.from(el(fixture).querySelectorAll<HTMLButtonElement>('button.court-chip'));
    expect(after.map((c) => c.classList.contains('active'))).toEqual([false, true, true]);
  });

  it('previsão nula avisa; com horas, clicar nas barras ajusta o período', () => {
    const { fixture } = render();
    const s = internals(fixture);
    s.forecastLoaded.set(true);
    s.forecast.set(null);
    fixture.detectChanges();
    expect(el(fixture).querySelector('.no-forecast')?.textContent).toContain('Sem previsão para a localização da arena');

    s.forecast.set({
      source: 'weatherapi',
      fetchedAt: new Date(2026, 9, 29, 14, 52),
      hours: [
        { time: '05:00', probability: 10, precipitationMm: 0 },
        { time: '16:00', probability: 40, precipitationMm: 0.8 },
        { time: '17:00', probability: 85, precipitationMm: 4.2 },
        { time: '18:00', probability: 92, precipitationMm: 6.1 },
      ],
    });
    fixture.detectChanges();
    const bars = () => Array.from(el(fixture).querySelectorAll<HTMLButtonElement>('ar-wx-hourly button.hour'));
    expect(bars().length).withContext('05:00 fica fora da faixa 06–23').toBe(3);
    expect(el(fixture).textContent).toContain('WeatherAPI · atualizada 14:52');

    bars()[1]!.click(); // 17:00
    bars()[2]!.click(); // 18:00
    fixture.detectChanges();
    expect(s.startHour()).toBe(17);
    expect(s.endHour()).toBe(19);
    expect(bars().map((b) => b.classList.contains('selected'))).toEqual([false, true, true]);
    const start = el(fixture).querySelector('select.start-select') as HTMLSelectElement;
    expect(start.options[start.selectedIndex]!.textContent?.trim()).toBe('17:00');
  });

  it('fim do período sempre depois do início', () => {
    const { fixture } = render();
    const start = el(fixture).querySelector('select.start-select') as HTMLSelectElement;
    start.value = '22';
    start.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    const s = internals(fixture);
    expect(s.startHour()).toBe(22);
    expect(s.endHour()).toBeGreaterThan(22);
    const end = el(fixture).querySelector('select.end-select') as HTMLSelectElement;
    expect(Array.from(end.options).map((o) => o.textContent?.trim())).toEqual(['23:00', '24:00']);
  });

  it('não aceita data passada; data futura volta ao período padrão', () => {
    const { fixture } = render();
    const component = fixture.componentInstance as unknown as { setDate(key: string): void };
    const s = internals(fixture);
    const today = dateKeyFrom(new Date());

    component.setDate('2000-01-01');
    fixture.detectChanges();
    expect(s.date()).toBe(today);
    expect(el(fixture).textContent).toContain('hoje ou datas futuras');

    const future = dateKeyFrom(new Date(Date.now() + 3 * 86_400_000));
    component.setDate(future);
    fixture.detectChanges();
    expect(s.date()).toBe(future);
    expect([s.startHour(), s.endHour()]).toEqual([17, 20]);
  });

  it('eventos do dia: "Liberar novas reservas" só no ativo com bloqueio', () => {
    const { fixture } = withPreview(render());
    const base: RainModeEvent = {
      id: 'e1',
      arenaId: 'a1',
      date: dateKeyFrom(new Date()),
      startTime: '17:00',
      endTime: '20:00',
      courtIds: ['c1', 'c2'],
      blockNewBookings: true,
      message: null,
      status: 'active',
      createdAt: null,
      endedAt: null,
      counts: { release: 3, partial: 1, cancel: 1, manual: 2 },
    };
    internals(fixture).events.set([base, { ...base, id: 'e2', status: 'ended', startTime: '20:00', endTime: '22:00' }]);
    fixture.detectChanges();

    const rows = Array.from(el(fixture).querySelectorAll('.event-row'));
    expect(rows.length).toBe(2);
    expect(rows[0]!.textContent).toContain('17:00–20:00 · Q1, Q2');
    expect(rows[0]!.textContent).toContain('3 liberadas · 1 proporcional · 1 cancelada · 2 à parte');
    expect(rows[0]!.querySelector('button.end-btn')?.textContent).toContain('Liberar novas reservas');
    expect(rows[1]!.querySelector('button.end-btn')).toBeNull();
    expect(rows[1]!.textContent).toContain('Encerrado');
  });

  it('sem escrita em agenda: não ativa, não edita mensagem', () => {
    const { fixture } = withPreview(render(false));

    expect(activateButton(fixture).disabled).toBeTrue();
    expect((el(fixture).querySelector('textarea.message-input') as HTMLTextAreaElement).disabled).toBeTrue();
    expect(el(fixture).querySelector('.info-banner')?.textContent).toContain('não ativar');
  });

  describe('ativar', () => {
    beforeAll(() => {
      if (getApps().length === 0) {
        initializeApp({ apiKey: 'fake-api-key', projectId: 'demo-arena-spec', appId: '1:0:web:0', messagingSenderId: '0' });
      }
    });

    it('confirma no modal, chama activateArenaRainMode e mostra o resultado', async () => {
      let sentUrl = '';
      let sentData: Record<string, unknown> = {};
      spyOn(window, 'fetch').and.callFake(async (input: RequestInfo | URL, init?: RequestInit) => {
        sentUrl = String(input);
        sentData = (JSON.parse(String(init?.body ?? '{}')) as { data: Record<string, unknown> }).data;
        return new Response(JSON.stringify({ result: { eventId: 'e9', released: 1, partial: 1, canceled: 1, manual: 1, notified: 2 } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      });
      const r = withPreview(render());
      r.arenaIdRef.value = 'arena-1';
      const s = internals(r.fixture);
      s.startHour.set(17);
      s.endHour.set(20);
      r.fixture.detectChanges();

      activateButton(r.fixture).click();
      r.fixture.detectChanges();
      const modal = el(r.fixture).querySelector('ar-modal');
      expect(modal?.textContent).toContain('17:00–20:00');
      expect(modal?.textContent).toContain('Não dá para desfazer');

      (modal!.querySelector('button.confirm-btn') as HTMLButtonElement).click();
      await settle(r.fixture);

      expect(sentUrl).toContain('activateArenaRainMode');
      expect(sentData).toEqual({
        arenaId: 'arena-1',
        date: s.date(),
        startTime: '17:00',
        endTime: '20:00',
        courtIds: ['c1', 'c2'],
        blockNewBookings: true,
      });
      expect(el(r.fixture).querySelector('ar-modal')).toBeNull();
      expect(el(r.fixture).querySelector('.activation-result')?.textContent).toContain('2 atletas avisados');
    });
  });
});
