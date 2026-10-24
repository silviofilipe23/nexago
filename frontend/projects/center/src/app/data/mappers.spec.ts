import { Timestamp } from 'firebase/firestore';
import { readEnrollmentRequest, readPolicies, readSession, readTrials } from './mappers';

describe('readTrials (experimentais na aula)', () => {
  it('lê o espelho do servidor, por nome; status desconhecido vira pendente', () => {
    const out = readTrials({
      uB: { bookingId: 'k_uB', name: 'Bruno', photoUrl: 'https://x/b.jpg', status: 'confirmed' },
      uA: { name: 'Ana', status: 'weird' },
      lixo: 'x',
    });
    expect(out).toEqual([
      { athleteId: 'uA', bookingId: '', name: 'Ana', photoUrl: null, status: 'pending' },
      { athleteId: 'uB', bookingId: 'k_uB', name: 'Bruno', photoUrl: 'https://x/b.jpg', status: 'confirmed' },
    ]);
  });

  it('aula sem o campo: lista vazia', () => {
    expect(readTrials(null)).toEqual([]);
    expect(readSession('k1_2026-10-22', { classId: 'k1', date: '2026-10-22' }).trials).toEqual([]);
  });
});

describe('readPolicies (trancar e cancelar)', () => {
  it('centro antigo ganha os padrões novos', () => {
    const p = readPolicies({ allowPause: false, pauseMaxDaysPerYear: 60 });
    expect(p.allowPause).toBeFalse();
    expect(p.pauseMaxDaysPerYear).toBe(60);
    expect(p.pauseMinDays).toBe(7);
    expect(p.injuryPauseApproval).toBe('manual');
    expect(p.injuryCountsInLimit).toBeFalse();
    expect(p.injuryMaxDays).toBe(90);
    expect(p.cancelRetention).toEqual(['pause', 'plan_change']);
    expect(p.allowCancelWithdraw).toBeTrue();
  });

  it('retenção: lista vazia vale e lixo é descartado', () => {
    expect(readPolicies({ cancelRetention: [] }).cancelRetention).toEqual([]);
    expect(readPolicies({ cancelRetention: ['plan_change', 'discount', 3] }).cancelRetention).toEqual(['plan_change']);
    expect(readPolicies({ cancelRetention: 'pause' }).cancelRetention).toEqual(['pause', 'plan_change']);
  });
});

describe('readEnrollmentRequest', () => {
  it('lê pausa por lesão com atestado', () => {
    const r = readEnrollmentRequest('r1', {
      enrollmentId: 'e1', studentName: 'Carla', type: 'injury', status: 'pending', source: 'app', startsOn: '2026-10-24', endsOn: '2026-11-22',
      days: 30, overLimit: false, createdAt: Timestamp.fromDate(new Date('2026-10-24T12:00:00Z')),
      certificate: { path: 'trainingCenterCertificates/c/u/a.pdf', fileName: 'a.pdf', contentType: 'application/pdf', sizeBytes: 1000, issuedOn: '2026-10-23', daysOff: 30, doctor: 'Dr. X', description: 'Joelho' },
    });
    expect(r.type).toBe('injury');
    expect(r.certificate?.daysOff).toBe(30);
    expect(r.createdAt?.toISOString()).toBe('2026-10-24T12:00:00.000Z');
    expect(r.retention).toBeNull();
  });

  it('documento incompleto cai em padrões seguros', () => {
    const r = readEnrollmentRequest('r2', { type: 'weird', status: 'nope', retention: { offered: ['pause', 'x'], accepted: 'plan_change', planName: '1x' } });
    expect(r.type).toBe('pause');
    expect(r.status).toBe('pending');
    expect(r.source).toBe('app');
    expect(r.certificate).toBeNull();
    expect(r.retention).toEqual({ offered: ['pause'], accepted: 'plan_change', planName: '1x', priceCents: null });
  });
});
