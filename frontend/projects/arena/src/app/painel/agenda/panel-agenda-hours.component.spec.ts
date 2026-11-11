import { provideZonelessChangeDetection, signal, type WritableSignal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { ArenaAccessService } from '../data/arena-access.service';
import { ArenaContextService } from '../data/arena-context.service';
import type { ArenaBooking } from '../bookings/arena-booking.model';
import type { ArenaCourt } from '../courts/court.model';
import type { ArenaSlot } from './arena-slot.model';
import { PanelAgendaHoursComponent } from './panel-agenda-hours.component';

/** Fiação da Agenda → Por horário (`docs/product/reservas-por-capacidade.md`, PR 5; canvas 04–06).
 *  Os dados entram pela mão (sem Firestore): `arenaId` nulo faz os efeitos voltarem cedo. */
interface Internals {
  loading: WritableSignal<boolean>;
  courts: WritableSignal<ArenaCourt[]>;
  slots: WritableSignal<ArenaSlot[]>;
  bookings: WritableSignal<ArenaBooking[]>;
  athleteLabels: WritableSignal<Record<string, string>>;
  selectedDate: WritableSignal<Date>;
}

const DAY = '2026-11-22';

function court(id: string, overrides: Partial<ArenaCourt> = {}): ArenaCourt {
  return { id, name: `Quadra ${id.slice(1)}`, types: ['beachTennis'], typeLabels: ['Beach Tennis'], status: 'active', basePricePerHourReais: null, ...overrides };
}

function slot(courtId: string, start: string, end: string, status: ArenaSlot['status'] = 'available'): ArenaSlot {
  return { id: `${courtId}-${start}`, arenaId: 'a1', courtId, dateKey: DAY, startTime: start, endTime: end, status, isVirtual: true, bookingId: null, bookingAthleteId: null, blockReason: null, blockNote: null };
}

function booking(id: string, courtId: string, overrides: Partial<ArenaBooking> = {}): ArenaBooking {
  return {
    id, arenaId: 'a1', athleteId: `ath-${id}`, courtId, courtName: `Quadra ${courtId.slice(1)}`, sportLabel: 'Beach Tennis',
    dateKey: DAY, startTime: '19:00', endTime: '20:00', status: 'active', attendanceStatus: 'pending', customerName: null,
    isRecurring: false, recurringBookingId: null, classSessionId: null, sportCode: 'beachTennis', clubSessionId: null,
    scheduleSubscriptionId: null, allocationStatus: null, amountReais: 120, paymentChannel: 'pix', paymentStatus: 'paid',
    confirmedParticipants: 1, canceledAt: null, cancelReason: null, createdAt: null, couponCode: null, couponDiscountReais: null,
    bookedAsProfessor: false, professorRelationshipType: null, professorDiscountPercent: 0, professorDiscountReais: null,
    ...overrides,
  };
}

function setup(canWrite = true): ComponentFixture<PanelAgendaHoursComponent> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      {
        provide: ArenaContextService,
        useValue: {
          arenaId: () => null,
          loading: () => false,
          notFound: () => false,
          arenaName: () => 'Arena CFC',
          managedArenas: () => [],
          arenaDocData: () => ({ bookingAllocation: { mode: 'capacity', courtIds: ['c1', 'c2', 'c3', 'c4'], revealBeforeArrival: true } }),
        },
      },
      { provide: ArenaAccessService, useValue: { isOwner: () => true, canRead: () => true, canWrite: () => canWrite } },
      { provide: AuthService, useValue: { user: signal({ email: 'gestor@example.com' }) } },
    ],
  });
  const fixture = TestBed.createComponent(PanelAgendaHoursComponent);
  const s = fixture.componentInstance as unknown as Internals;
  s.selectedDate.set(new Date(2026, 10, 22));
  s.courts.set([court('c1'), court('c2'), court('c3'), court('c4')]);
  s.slots.set(['c1', 'c2', 'c3', 'c4'].flatMap((c) => [slot(c, '18:00', '19:00'), slot(c, '19:00', '20:00')]).concat(slot('c4', '19:00', '20:00', 'blocked')).filter((x, i, all) => !(x.courtId === 'c4' && x.startTime === '19:00' && x.status === 'available' && all.some((o) => o.courtId === 'c4' && o.startTime === '19:00' && o.status === 'blocked'))));
  s.bookings.set([
    booking('flo', 'c1', { allocationStatus: 'unassigned' }),
    booking('fix', 'c2', { allocationStatus: 'assigned', attendanceStatus: 'checked_in' }),
    booking('early', 'c1', { startTime: '18:00', endTime: '19:00' }),
  ]);
  s.athleteLabels.set({ 'ath-flo': 'Enzo Ribeiro', 'ath-fix': 'Ana Souza', 'ath-early': 'Júlia Lima' });
  s.loading.set(false);
  fixture.detectChanges();
  return fixture;
}

const host = (f: ComponentFixture<unknown>) => f.nativeElement as HTMLElement;
const buttons = (f: ComponentFixture<unknown>, text: string) =>
  Array.from(host(f).querySelectorAll('button')).filter((b) => (b.textContent ?? '').trim().startsWith(text));

describe('Agenda → Por horário', () => {
  it('lista os horários com ocupação e quantas sem quadra', () => {
    const f = setup();
    const hours = Array.from(host(f).querySelectorAll('.hour')).map((h) => h.textContent!.replace(/\s+/g, ' ').trim());
    expect(hours.length).toBe(2);
    expect(hours[1]).toContain('19:00');
    expect(hours[1]).toContain('2/3 reservadas');
    expect(hours[1]).toContain('1 sem quadra');
  });

  it('no horário: provisória primeiro, Definir quadra, Confirmar todas e quem já chegou', async () => {
    const f = setup();
    buttons(f, '19:00')[0]?.click();
    host(f).querySelectorAll<HTMLButtonElement>('.hour')[1]!.click();
    f.detectChanges();
    await f.whenStable();

    const names = Array.from(host(f).querySelectorAll('.bk-n')).map((n) => n.textContent!.trim());
    expect(names).toEqual(['Enzo Ribeiro', 'Ana Souza']);
    expect(buttons(f, 'Definir quadra').length).toBe(1);
    expect(buttons(f, 'Confirmar todas (1)').length).toBe(1);
    expect(host(f).textContent).toContain('Chegou');

    buttons(f, 'Confirmar todas')[0]!.click();
    f.detectChanges();
    expect(host(f).querySelector('.crow')?.textContent).toContain('Quadra 1');
  });

  it('clubinho: "Trocar" abre o modal com o aviso de que muda só a sessão do dia', async () => {
    const f = setup();
    const s = f.componentInstance as unknown as Internals;
    s.bookings.update((list) => [
      ...list,
      booking('club', 'c3', {
        athleteId: '', customerName: 'Clubinho de sexta', clubSessionId: 'club_c1_2026-11-22', sportCode: null, allocationStatus: 'unassigned',
      }),
    ]);
    f.detectChanges();
    host(f).querySelectorAll<HTMLButtonElement>('.hour')[1]!.click();
    f.detectChanges();
    await f.whenStable();
    const rows = Array.from(host(f).querySelectorAll('.bk-n')).map((n) => n.textContent!.trim());
    expect(rows).toContain('Clubinho de sexta');
    // Provisório, mas "Trocar" (nunca "Definir quadra"); "Confirmar todas" não conta o clubinho.
    const trocar = buttons(f, 'Trocar');
    expect(trocar.length).toBe(2);
    expect(buttons(f, 'Definir quadra').length).toBe(1);
    expect(buttons(f, 'Confirmar todas (1)').length).toBe(1);
    trocar[0]!.click();
    f.detectChanges();
    expect(host(f).querySelector('[data-testid="hours-club-court-change-scope"]')?.textContent).toContain('dom, 22/11');
  });

  it('quadro: soltar em quadra com reserva definida é recusado sem chamar o servidor', async () => {
    const f = setup();
    host(f).querySelectorAll<HTMLButtonElement>('.hour')[1]!.click();
    f.detectChanges();
    buttons(f, 'Quadro')[0]!.click();
    f.detectChanges();

    const tiles = host(f).querySelectorAll<HTMLElement>('.tile');
    expect(Array.from(tiles).map((t) => t.querySelector('.tile-h')!.textContent!.trim())).toEqual(['Quadra 1', 'Quadra 2', 'Quadra 3', 'Quadra 4']);
    expect(tiles[3]!.classList).toContain('blocked');

    const chip = tiles[0]!.querySelector<HTMLElement>('.chipbk')!;
    expect(chip.getAttribute('draggable')).toBe('true');
    chip.dispatchEvent(new DragEvent('dragstart', { dataTransfer: new DataTransfer() }));
    tiles[1]!.dispatchEvent(new DragEvent('drop', { dataTransfer: new DataTransfer() }));
    f.detectChanges();
    await f.whenStable();
    expect(host(f).querySelector('.banner.error')?.textContent).toContain('já tem reserva com quadra definida');
  });

  it('cargo só de leitura não vê ações nem arrasta', () => {
    const f = setup(false);
    host(f).querySelectorAll<HTMLButtonElement>('.hour')[1]!.click();
    f.detectChanges();
    expect(buttons(f, 'Definir quadra').length).toBe(0);
    expect(buttons(f, 'Confirmar todas').length).toBe(0);
    buttons(f, 'Quadro')[0]!.click();
    f.detectChanges();
    expect(host(f).querySelector('.chipbk')?.getAttribute('draggable')).toBe('false');
  });
});
