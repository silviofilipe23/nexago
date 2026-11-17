import { provideZonelessChangeDetection, signal, type Signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import { BehaviorSubject } from 'rxjs';
import { AuthService } from '../../auth/auth.service';
import { arenaBookingFromDoc, type ArenaBooking } from '../bookings/arena-booking.model';
import { ArenaAccessService } from '../data/arena-access.service';
import { ArenaContextService } from '../data/arena-context.service';
import type { AgendaBlock } from '../ui/agenda-grid.component';
import { virtualSlot, type ArenaSlot } from './arena-slot.model';
import { PanelAgendaComponent } from './panel-agenda.component';

/** Fiação da tela: a reserva de 2h da Lara (20h–22h) chega como dois slots de 1h e tem que
 *  virar UM bloco na grade — e o clique nele continua abrindo a reserva. */
interface AgendaInternals {
  slots: WritableSignal<ArenaSlot[]>;
  bookings: WritableSignal<ArenaBooking[]>;
  selectedDate: WritableSignal<Date>;
  agendaBlocks: Signal<AgendaBlock[]>;
  onBlockClick(id: string): void;
}

const DATE_KEY = '2026-11-17';

function booked(start: string, end: string, bookingId: string): ArenaSlot {
  return { ...virtualSlot('a1', 'c1', DATE_KEY, start, end), status: 'booked', bookingId };
}

function booking(id: string, start: string, end: string): ArenaBooking {
  const doc = {
    id,
    data: () => ({ arenaId: 'a1', courtId: 'c1', dateKey: DATE_KEY, startTime: start, endTime: end, status: 'confirmed', customerName: 'Lara' }),
  } as unknown as QueryDocumentSnapshot;
  return arenaBookingFromDoc(doc);
}

function setup() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: ActivatedRoute, useValue: { queryParamMap: new BehaviorSubject(convertToParamMap({})) } },
      {
        provide: ArenaContextService,
        useValue: {
          arenaId: () => null,
          loading: () => false,
          notFound: () => false,
          arenaName: () => 'Arena CFC',
          managedArenas: () => [],
          arenaDocData: () => ({}),
        },
      },
      { provide: ArenaAccessService, useValue: { isOwner: () => true, canRead: () => true, canWrite: () => true } },
      { provide: AuthService, useValue: { user: signal({ email: 'gestor@example.com' }) } },
    ],
  });
  const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
  const fixture = TestBed.createComponent(PanelAgendaComponent);
  const agenda = fixture.componentInstance as unknown as AgendaInternals;
  const [y, m, d] = DATE_KEY.split('-').map(Number);
  agenda.selectedDate.set(new Date(y, m - 1, d));
  return { agenda, navigate };
}

describe('reserva de mais de uma hora na agenda', () => {
  it('aparece como um bloco contínuo e o clique abre a reserva', () => {
    const { agenda, navigate } = setup();
    agenda.bookings.set([booking('bk1', '20:00', '22:00')]);
    agenda.slots.set([booked('20:00', '21:00', 'bk1'), booked('21:00', '22:00', 'bk1')]);

    const blocks = agenda.agendaBlocks().filter((b) => b.courtId === 'c1');

    expect(blocks.length).toBe(1);
    expect(blocks[0]).toEqual(jasmine.objectContaining({ start: 20 * 60, dur: 120, status: 'confirmada', client: 'Lara' }));

    agenda.onBlockClick(blocks[0].id);
    expect(navigate).toHaveBeenCalledWith(['/painel/reservas', 'bk1']);
  });

  it('duas reservas coladas de clientes diferentes seguem separadas', () => {
    const { agenda } = setup();
    agenda.bookings.set([booking('bk1', '20:00', '21:00'), booking('bk2', '21:00', '22:00')]);
    agenda.slots.set([booked('20:00', '21:00', 'bk1'), booked('21:00', '22:00', 'bk2')]);

    expect(agenda.agendaBlocks().filter((b) => b.courtId === 'c1').length).toBe(2);
  });
});
