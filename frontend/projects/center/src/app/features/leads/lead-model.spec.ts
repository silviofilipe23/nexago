import { Timestamp } from 'firebase/firestore';
import type { ClassSession, TrainingClass } from '../../domain/models';
import {
  DEFAULT_LEAD_SETTINGS,
  ago,
  byStage,
  funnelStats,
  isValidPhone,
  leadFlag,
  lostSummary,
  nextLine,
  phoneDigits,
  readLead,
  readLeadSettings,
  slotLabel,
  trialSlots,
  trialWhenShort,
  whatsAppLink,
  type Lead,
} from './lead-model';

const NOW = new Date('2026-10-24T13:00:00Z'); // sáb 24/10 10:00 em Brasília
const TODAY = '2026-10-24';

function lead(over: Record<string, unknown> = {}): Lead {
  return readLead('l1', {
    name: 'Mariana Couto',
    phone: '(21) 99604-1182',
    phoneDigits: '21996041182',
    source: 'instagram',
    stage: 'new',
    interest: { programId: 'bt', programName: 'Beach Tennis', experience: 'never' },
    createdAt: Timestamp.fromDate(new Date('2026-10-24T12:42:00Z')),
    updatedAt: Timestamp.fromDate(new Date('2026-10-24T12:42:00Z')),
    history: [],
    ...over,
  });
}

function cls(over: Partial<TrainingClass> = {}): TrainingClass {
  return {
    id: 'k1', name: 'BT Iniciante A', programId: 'bt', level: 'Iniciante', coachUid: 'c', coachName: 'Thiago', weekdays: [2, 4],
    startTime: '19:00', durationMin: 60, locationId: '', locationName: 'Quadra 1', courtId: '', courtName: '', capacity: 3,
    seatsTaken: 1, rosterStudentIds: ['a'], startDate: '2026-01-01', endDate: null, status: 'active', generatedUntil: null, ...over,
  };
}

function session(id: string, date: string, over: Partial<ClassSession> = {}): ClassSession {
  return {
    id, classId: 'k1', className: 'BT Iniciante A', programId: 'bt', date, startTime: '19:00', durationMin: 60, coachUid: 'c',
    coachName: 'Thiago', locationId: '', locationName: 'Quadra 1', locationAddress: '', courtId: '', courtName: '', status: 'scheduled',
    changed: false, changeReason: '', attendance: {}, makeupStudentIds: [], finalizedAt: null, finalizedByName: '', attendanceLog: [],
    effectsApplied: {}, rsvps: {}, attendanceByStudent: {}, trials: [], ...over,
  };
}

describe('captação · modelo', () => {
  it('lê o interessado tolerando campos ausentes', () => {
    const l = readLead('x', { name: 'Ana', stage: 'qualquer', source: 'tiktok' });
    expect(l.stage).toBe('new');
    expect(l.source).toBe('other');
    expect(l.trial).toBeNull();
    expect(l.interest.programName).toBe('');
  });

  it('telefone: sem DDI e validação com DDD', () => {
    expect(phoneDigits('+55 (21) 99604-1182')).toBe('21996041182');
    expect(isValidPhone('(21) 99604-1182')).toBeTrue();
    expect(isValidPhone('99604-1182')).toBeFalse();
    expect(whatsAppLink('21996041182', 'oi')).toBe('https://wa.me/5521996041182?text=oi');
  });

  it('configuração cai no padrão fora da faixa', () => {
    expect(readLeadSettings(undefined)).toEqual(DEFAULT_LEAD_SETTINGS);
    expect(readLeadSettings({ maxTrialsPerSession: 9, publicPage: true }).maxTrialsPerSession).toBe(9);
    expect(readLeadSettings({ maxTrialsPerSession: 0 }).maxTrialsPerSession).toBe(2);
  });

  it('novo: prazo de resposta e alerta depois de alertHours', () => {
    expect(ago(new Date('2026-10-24T12:42:00Z'), NOW)).toBe('há 18 min');
    const l = lead();
    expect(leadFlag(l, 2, NOW)).toBeNull();
    expect(nextLine(l, 2, TODAY, NOW)).toBe('Responder até 11:42');
    expect(leadFlag(lead({ createdAt: Timestamp.fromDate(new Date('2026-10-24T09:00:00Z')) }), 2, NOW)).toBe('warn');
  });

  it('avaliado fica quente e mostra o nível do professor', () => {
    const l = lead({ stage: 'attended', coachFeedback: { level: 'intermediate', byName: 'Thiago Mendes' } });
    expect(leadFlag(l, 2, NOW)).toBe('hot');
    expect(nextLine(l, 2, TODAY, NOW)).toBe('Thiago: “nível intermediário”');
  });

  it('colunas ordenadas: novos mais antigos primeiro, agendados pela aula', () => {
    const a = lead({ createdAt: Timestamp.fromDate(new Date('2026-10-24T10:00:00Z')) });
    const b = readLead('l2', { name: 'B', stage: 'new', createdAt: Timestamp.fromDate(new Date('2026-10-23T10:00:00Z')) });
    expect(byStage([a, b], 'new').map((l) => l.id)).toEqual(['l2', 'l1']);
    const s1 = readLead('s1', { name: 'S1', stage: 'scheduled', trial: { date: '2026-10-29', startTime: '07:00' } });
    const s2 = readLead('s2', { name: 'S2', stage: 'scheduled', trial: { date: '2026-10-27', startTime: '19:00' } });
    expect(byStage([s1, s2], 'scheduled').map((l) => l.id)).toEqual(['s2', 's1']);
    expect(trialWhenShort({ date: '2026-10-24', startTime: '07:00' }, TODAY)).toBe('Hoje 07:00');
  });

  it('números do mês e perdidos por motivo', () => {
    const list = [
      lead({ firstContactAt: Timestamp.fromDate(new Date('2026-10-24T12:52:00Z')), stage: 'contacted' }),
      readLead('w', { name: 'W', stage: 'won', updatedAt: Timestamp.fromDate(new Date('2026-10-20T12:00:00Z')),
        trial: { date: '2026-10-15', attendance: 'attended' } }),
      readLead('p', { name: 'P', stage: 'lost', lostReason: 'price' }),
      readLead('q', { name: 'Q', stage: 'lost', lostReason: 'price' }),
      readLead('old', { name: 'Velho', stage: 'new', createdAt: Timestamp.fromDate(new Date('2026-09-30T12:00:00Z')) }),
    ];
    const s = funnelStats(list, TODAY, NOW);
    expect(s.newThisMonth).toBe(1);
    expect(s.newPrevMonth).toBe(1);
    expect(s.attendedThisMonth).toBe(1);
    expect(s.wonThisMonth).toBe(1);
    expect(s.noReply).toBe(1);
    expect(s.avgResponseMin).toBe(10);
    expect(lostSummary(list)).toEqual({ total: 2, reasons: [{ reason: 'price', count: 2 }] });
  });

  it('horários: vagas, limite por aula e só com vaga', () => {
    const sessions = [
      session('k1_2026-10-27', '2026-10-27'),
      session('k1_2026-10-29', '2026-10-29', { trials: [{ athleteId: 'x', bookingId: 'b', name: 'X', photoUrl: null, status: 'confirmed' }, { athleteId: 'y', bookingId: 'c', name: 'Y', photoUrl: null, status: 'confirmed' }] }),
      session('k1_2026-10-22', '2026-10-22'),
      session('k1_2026-11-20', '2026-11-20'),
    ];
    const slots = trialSlots(sessions, [cls()], DEFAULT_LEAD_SETTINGS, TODAY, '10:00');
    expect(slots.map((s) => s.sessionId)).toEqual(['k1_2026-10-27', 'k1_2026-10-29']);
    expect(slotLabel(slots[0]!)).toBe('2 vagas · 0 experimentais');
    expect(slots[1]!.blocked).toBe('Limite de experimentais atingido');
    const full = trialSlots([session('k1_2026-10-27', '2026-10-27', { makeupStudentIds: ['m1', 'm2'] })], [cls()], DEFAULT_LEAD_SETTINGS, TODAY, '10:00');
    expect(full[0]!.blocked).toBe('Turma sem vaga');
    const loose = trialSlots([session('k1_2026-10-27', '2026-10-27', { makeupStudentIds: ['m1', 'm2'] })], [cls()], { ...DEFAULT_LEAD_SETTINGS, onlyWithSpots: false }, TODAY, '10:00');
    expect(loose[0]!.blocked).toBeNull();
  });
});
