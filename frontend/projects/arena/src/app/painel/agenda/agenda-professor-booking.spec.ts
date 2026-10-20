import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import { arenaBookingFromDoc, professorBookingLabel } from '../bookings/arena-booking.model';
import { AgendaGridComponent, type AgendaBlock } from '../ui/agenda-grid.component';
import { AgendaWeekGridComponent } from '../ui/agenda-week-grid.component';
import { agendaSlotTag } from './panel-agenda.component';

function fakeDoc(id: string, data: Record<string, unknown>): QueryDocumentSnapshot {
  return { id, data: () => data } as unknown as QueryDocumentSnapshot;
}

describe('reserva feita como professor (bookedAs)', () => {
  it('lê o carimbo e o tipo do vínculo; reserva de atleta fica sem nada', () => {
    const staff = arenaBookingFromDoc(
      fakeDoc('b1', { athleteId: 'u1', bookedAs: 'professor', professorLinkId: 'a1_u1', professorRelationshipType: 'ARENA_STAFF' }),
    );
    expect(staff.bookedAsProfessor).toBeTrue();
    expect(staff.professorRelationshipType).toBe('ARENA_STAFF');

    const athlete = arenaBookingFromDoc(fakeDoc('b2', { athleteId: 'u1' }));
    expect(athlete.bookedAsProfessor).toBeFalse();
    expect(athlete.professorRelationshipType).toBeNull();

    // Só o carimbo do servidor vale: outro valor não vira professor.
    expect(arenaBookingFromDoc(fakeDoc('b3', { bookedAs: 'athlete' })).bookedAsProfessor).toBeFalse();
    const unknownType = arenaBookingFromDoc(fakeDoc('b4', { bookedAs: 'professor', professorRelationshipType: 'X' }));
    expect(unknownType.bookedAsProfessor).toBeTrue();
    expect(unknownType.professorRelationshipType).toBeNull();
  });

  it('rótulo do detalhe: mesmo texto do app, por tipo', () => {
    expect(professorBookingLabel({ bookedAsProfessor: true, professorRelationshipType: 'ARENA_STAFF' })).toBe(
      'Professor · equipe da arena',
    );
    expect(professorBookingLabel({ bookedAsProfessor: true, professorRelationshipType: 'INDEPENDENT' })).toBe(
      'Professor · independente',
    );
    expect(professorBookingLabel({ bookedAsProfessor: true, professorRelationshipType: null })).toBe('Professor');
    expect(professorBookingLabel({ bookedAsProfessor: false, professorRelationshipType: null })).toBeNull();
  });

  it('selo na agenda só no horário ocupado pela reserva de professor', () => {
    expect(agendaSlotTag({ status: 'booked' }, { bookedAsProfessor: true })).toBe('Professor');
    expect(agendaSlotTag({ status: 'booked' }, { bookedAsProfessor: true }, true)).toBe('Prof');
    expect(agendaSlotTag({ status: 'booked' }, { bookedAsProfessor: false })).toBeNull();
    expect(agendaSlotTag({ status: 'booked' }, null)).toBeNull();
    expect(agendaSlotTag({ status: 'available' }, { bookedAsProfessor: true })).toBeNull();
    expect(agendaSlotTag({ status: 'blocked' }, { bookedAsProfessor: true })).toBeNull();
  });
});

describe('selo "Professor" nas grades da agenda', () => {
  const block: AgendaBlock = { id: 's1', courtId: 'c1', start: 9 * 60, dur: 60, status: 'confirmada', client: 'Carla Dias', tag: 'Professor' };

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });

  it('grade do dia: o bloco mostra o selo antes do nome; sem tag, nada', async () => {
    const fixture = TestBed.createComponent(AgendaGridComponent);
    fixture.componentRef.setInput('courts', [{ id: 'c1', name: 'Quadra 1', sport: 'Beach tennis' }]);
    fixture.componentRef.setInput('blocks', [block, { ...block, id: 's2', start: 11 * 60, client: 'Bruno', tag: null }]);
    await fixture.whenStable();
    const blocks = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.block'));
    expect(blocks.length).toBe(2);
    expect(blocks[0]!.querySelector('.block-tag')?.textContent?.trim()).toBe('Professor');
    expect(blocks[0]!.querySelector('.block-title')?.textContent?.trim()).toBe('Carla Dias');
    expect(blocks[1]!.querySelector('.block-tag')).toBeNull();
  });

  it('grade da semana: mesmo selo', async () => {
    const fixture = TestBed.createComponent(AgendaWeekGridComponent);
    fixture.componentRef.setInput('weekDays', [{ dateKey: '2026-10-20', date: new Date(2026, 9, 20), isToday: false }]);
    fixture.componentRef.setInput('courts', [{ id: 'c1', name: 'Quadra 1', sport: 'Beach tennis' }]);
    fixture.componentRef.setInput('blocks', [{ ...block, dateKey: '2026-10-20', tag: 'Prof' }]);
    fixture.componentRef.setInput('selectedDateKey', '2026-10-20');
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('.block-tag')?.textContent?.trim()).toBe('Prof');
  });
});
