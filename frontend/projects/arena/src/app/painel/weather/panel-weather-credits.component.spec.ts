import { provideZonelessChangeDetection, signal, type WritableSignal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { ArenaAccessService } from '../data/arena-access.service';
import { ArenaContextService } from '../data/arena-context.service';
import { PanelWeatherCreditsComponent } from './panel-weather-credits.component';
import { monthLongLabel, type WeatherCredit } from './weather.model';

interface CreditsInternals {
  credits: WritableSignal<WeatherCredit[]>;
  loading: WritableSignal<boolean>;
  now: WritableSignal<Date>;
}

/** Quinta, 29/10/2026, 14:30 (horário local). */
const NOW = new Date(2026, 9, 29, 14, 30);

function credit(over: Partial<WeatherCredit>): WeatherCredit {
  return {
    id: 'wx',
    arenaId: 'a1',
    athleteId: 'u1',
    athleteName: 'Enzo Ribeiro',
    originBookingId: 'b1',
    originCourtName: 'Quadra 1',
    originDate: '2026-10-29',
    originStartTime: '17:00',
    amountReais: 60,
    balanceReais: 60,
    status: 'open',
    source: 'choice',
    expiresAt: new Date(2027, 0, 27),
    createdAt: new Date(2026, 9, 29, 18),
    uses: [],
    ...over,
  };
}

const CREDITS: WeatherCredit[] = [
  credit({ id: '1', athleteId: 'u1', athleteName: 'Enzo Ribeiro' }),
  credit({ id: '2', athleteId: 'u2', athleteName: 'Marina Lopes', originCourtName: 'Quadra 2', amountReais: 90, balanceReais: 90 }),
  credit({
    id: '3', athleteId: 'u3', athleteName: 'Júlia Andrade', status: 'used', amountReais: 70, balanceReais: 0, originDate: '2026-10-28', originStartTime: '19:00',
    uses: [{ bookingId: 'n1', amountReais: 70, at: new Date(2026, 9, 28, 20), kind: 'reschedule' }],
  }),
  credit({ id: '4', athleteId: 'u4', athleteName: 'Caio Mendes', amountReais: 70, balanceReais: 40, source: 'reschedule', createdAt: new Date(2026, 9, 14) }),
  credit({ id: '5', athleteId: 'u5', athleteName: 'Laura Viana', expiresAt: new Date(2026, 10, 3, 10) }),
  credit({ id: '6', athleteId: 'u6', athleteName: 'Thiago Rocha', status: 'expired', amountReais: 70, balanceReais: 70, expiresAt: new Date(2026, 9, 20) }),
];

function render(): ComponentFixture<PanelWeatherCreditsComponent> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      {
        provide: ArenaContextService,
        useValue: { arenaId: () => null, loading: () => false, notFound: () => false, arenaName: () => 'Arena CFC', managedArenas: () => [], arenaDocData: () => null },
      },
      // Financeiro é só leitura para o gestor: a tela não depende de escrita.
      { provide: ArenaAccessService, useValue: { isOwner: () => false, canRead: () => true, canWrite: () => false } },
      { provide: AuthService, useValue: { user: signal({ email: 'gestor@example.com' }), signOutUser: async () => {} } },
    ],
  });
  const fixture = TestBed.createComponent(PanelWeatherCreditsComponent);
  fixture.detectChanges();
  const s = fixture.componentInstance as unknown as CreditsInternals;
  s.now.set(NOW);
  s.credits.set(CREDITS);
  s.loading.set(false);
  fixture.detectChanges();
  return fixture;
}

function el(fixture: ComponentFixture<unknown>): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

function text(node: Element | null | undefined): string {
  return node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

function rows(fixture: ComponentFixture<unknown>): HTMLElement[] {
  return Array.from(el(fixture).querySelectorAll<HTMLElement>('.credit-row'));
}

describe('PanelWeatherCreditsComponent', () => {
  it('4 KPIs calculados da lista', () => {
    const fixture = render();
    const kpis = Array.from(el(fixture).querySelectorAll('.kpi')).map((k) => ({
      label: text(k.querySelector('.wx-kicker')),
      value: text(k.querySelector('.kpi-value')),
      sub: text(k.querySelector('.kpi-sub')),
    }));
    const month = monthLongLabel(NOW);

    expect(kpis.length).toBe(4);
    expect(kpis.map((k) => k.label)).toEqual(['Em aberto', `Usados em ${month}`, 'Remarcações', 'Vencem em 30 dias']);
    expect(kpis[0]!.value).toMatch(/^R\$\s250,00$/);
    expect(kpis[0]!.sub).toBe('4 atletas');
    expect(kpis[1]!.value).toMatch(/^R\$\s70,00$/);
    expect(kpis[1]!.sub).toBe('1 reserva');
    expect(kpis[2]!.value).toBe('1');
    expect(kpis[2]!.sub).toBe(`em ${month}`);
    expect(kpis[3]!.value).toMatch(/^R\$\s60,00$/);
    expect(kpis[3]!.sub).toBe('1 atleta');
    expect(el(fixture).querySelectorAll('.kpi-value.warn').length).toBe(1);
  });

  it('extrato: pill por status, saldo do expirado zerado e linhas apagadas', () => {
    const fixture = render();
    const all = rows(fixture);
    const byName = (name: string) => all.find((r) => text(r).includes(name))!;

    expect(all.length).toBe(6);
    expect(text(byName('Enzo Ribeiro'))).toContain('Q1 · 29 Out · 17:00');
    expect(text(byName('Enzo Ribeiro'))).toContain('27 Jan 2027');
    expect(text(byName('Enzo Ribeiro'))).toContain('Em aberto');
    expect(text(byName('Caio Mendes'))).toContain('Parcial');
    expect(text(byName('Laura Viana'))).toContain('Vence em 5 dias');
    expect(text(byName('Júlia Andrade'))).toContain('Usado');
    expect(text(byName('Thiago Rocha'))).toContain('Expirou');
    expect(text(byName('Thiago Rocha').querySelector('.cell-money'))).toMatch(/^R\$\s0,00$/);
    expect(byName('Júlia Andrade').classList).toContain('faded');
    expect(byName('Thiago Rocha').classList).toContain('faded');
    expect(byName('Enzo Ribeiro').classList).not.toContain('faded');
    expect(text(el(fixture))).toContain('Créditos expirados voltam como receita da arena.');
  });

  it('filtros Em aberto e Vencendo', () => {
    const fixture = render();
    const chip = (label: string) =>
      Array.from(el(fixture).querySelectorAll<HTMLButtonElement>('button.filter-chip')).find((c) => text(c) === label)!;

    chip('Em aberto').click();
    fixture.detectChanges();
    expect(rows(fixture).length).toBe(4);
    expect(chip('Em aberto').classList).toContain('active');

    chip('Vencendo').click();
    fixture.detectChanges();
    expect(rows(fixture).map((r) => text(r.querySelector('.who-name')))).toEqual(['Laura Viana']);
  });

  it('Exportar gera CSV do filtro atual no navegador', async () => {
    const fixture = render();
    let blob: Blob | null = null;
    spyOn(URL, 'createObjectURL').and.callFake((b: Blob | MediaSource) => {
      blob = b as Blob;
      return 'blob:fake';
    });
    spyOn(URL, 'revokeObjectURL');
    const clickSpy = spyOn(HTMLAnchorElement.prototype, 'click');

    (el(fixture).querySelector('button.export-btn') as HTMLButtonElement).click();

    expect(clickSpy).toHaveBeenCalledTimes(1);
    const csv = await (blob as unknown as Blob).text();
    const lines = csv.replace(/^﻿/, '').split('\r\n');
    expect(lines[0]).toBe('Atleta;Reserva de origem;Crédito (R$);Saldo (R$);Validade;Status');
    expect(lines.length).toBe(7);
  });
});
