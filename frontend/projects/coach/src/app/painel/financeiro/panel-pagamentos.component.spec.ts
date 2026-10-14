import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { AthletesService, type RosterAthlete } from '../atletas/athletes.service';
import { TrainingsService, type Training } from '../treinos/trainings.service';
import type { Charge } from './finance-model';
import { FinanceService } from './finance.service';
import { PanelPagamentosComponent } from './panel-pagamentos.component';

const athlete = (uid: string, over: Partial<RosterAthlete> = {}): RosterAthlete =>
  ({ athleteUid: uid, displayName: uid.toUpperCase(), initials: 'XX', category: '', squadId: 's1', status: 'ativo', ...over }) as RosterAthlete;

const missed = (id: string, date: string, uid: string): Training => ({
  id,
  squadId: 's1',
  title: 'Aula',
  date,
  startTime: '19:00',
  endTime: '',
  location: '',
  materials: '',
  exercises: [],
  status: 'realizado',
  attendance: { [uid]: 'ausente' },
  seriesId: null,
});

const charge = (id: string, uid: string, over: Partial<Charge> = {}): Charge => ({
  id,
  athleteUid: uid,
  athleteName: uid.toUpperCase(),
  planId: 'p1',
  planName: 'Mensal',
  periodKey: '2026-10',
  amountCents: 18000,
  dueDate: '2026-10-20',
  status: 'pendente',
  paidAt: null,
  method: null,
  note: '',
  ...over,
});

function setup(charges: Charge[], roster: RosterAthlete[], trainings: Training[]) {
  const finance = {
    month: signal('2026-10'),
    today: signal('2026-10-14'),
    monthCharges: signal(charges),
    overdueCharges: signal<Charge[]>([]),
    ready: signal(true),
    error: signal<string | null>(null),
  };
  TestBed.configureTestingModule({
    imports: [PanelPagamentosComponent],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: FinanceService, useValue: finance },
      { provide: AthletesService, useValue: { roster: signal(roster) } },
      { provide: TrainingsService, useValue: { trainings: signal(trainings) } },
      { provide: AuthService, useValue: { user: signal(null), displayName: signal(null) } },
    ],
  });
  const fixture = TestBed.createComponent(PanelPagamentosComponent);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

const twoMisses = [missed('t1', '2026-10-01', 'a1'), missed('t2', '2026-10-08', 'a1')];

describe('PanelPagamentosComponent — faltas seguidas na parcela', () => {
  it('parcela em aberto de aluno com 2 faltas seguidas mostra o selo e o aviso', () => {
    const el = setup([charge('c1', 'a1')], [athlete('a1')], twoMisses);
    expect(el.textContent).toContain('2 faltas seguidas');
    expect(el.textContent).toContain('1 aluno devendo com faltas seguidas');
  });

  it('parcela paga não mostra o selo nem o aviso', () => {
    const el = setup([charge('c1', 'a1', { status: 'pago', paidAt: '2026-10-05', method: 'pix' })], [athlete('a1')], twoMisses);
    expect(el.textContent).not.toContain('faltas seguidas');
  });

  it('aluno sem faltas seguidas não ganha selo', () => {
    const el = setup([charge('c1', 'a2')], [athlete('a1'), athlete('a2')], twoMisses);
    expect(el.textContent).not.toContain('faltas seguidas');
  });
});
