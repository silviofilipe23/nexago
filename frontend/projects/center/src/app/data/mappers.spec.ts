import { Timestamp } from 'firebase/firestore';
import { readEnrollmentRequest, readInvoice, readPolicies, readSession, readTrials } from './mappers';

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
    expect(p.retentionDiscountPercent).toBe(20);
    expect(p.requireMedicalClearance).toBeFalse();
  });

  it('desconto de retenção e alta médica: lê os válidos, percentual fora da lista cai em 20', () => {
    const p = readPolicies({ cancelRetention: ['discount', 'pause'], retentionDiscountPercent: 30, requireMedicalClearance: true });
    expect(p.cancelRetention).toEqual(['pause', 'discount']);
    expect(p.retentionDiscountPercent).toBe(30);
    expect(p.requireMedicalClearance).toBeTrue();
    expect(readPolicies({ retentionDiscountPercent: 25 }).retentionDiscountPercent).toBe(20);
    expect(readPolicies({ retentionDiscountPercent: '50' }).retentionDiscountPercent).toBe(20);
    expect(readPolicies({ requireMedicalClearance: 'yes' }).requireMedicalClearance).toBeFalse();
  });

  it('retenção: lista vazia vale e lixo é descartado', () => {
    expect(readPolicies({ cancelRetention: [] }).cancelRetention).toEqual([]);
    expect(readPolicies({ cancelRetention: ['plan_change', 'discount', 3, 'x'] }).cancelRetention).toEqual(['plan_change', 'discount']);
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
    expect(r.retention).toEqual({ offered: ['pause'], accepted: 'plan_change', planName: '1x', priceCents: null, percent: null });
    expect(r.requireClearance).toBeFalse();
    expect(r.clearanceStatus).toBe('');
    expect(r.clearance).toBeNull();
    expect(r.awaitingClearance).toBeFalse();
  });

  it('cancelamento retido com desconto de 1 mês', () => {
    const r = readEnrollmentRequest('r3', {
      type: 'cancel', status: 'retained', effectiveFrom: '2026-11-10',
      retention: { offered: ['pause', 'discount'], accepted: 'discount', percent: 20, priceCents: 20000 },
    });
    expect(r.retention).toEqual({ offered: ['pause', 'discount'], accepted: 'discount', planName: '', priceCents: 20000, percent: 20 });
    expect(r.effectiveFrom).toBe('2026-11-10');
  });

  it('pausa por lesão com alta médica enviada e segurada', () => {
    const r = readEnrollmentRequest('r4', {
      type: 'injury', status: 'active', requireClearance: true, clearanceStatus: 'submitted', awaitingClearance: true,
      clearance: { path: 'trainingCenterCertificates/c/u/alta.pdf', fileName: 'alta.pdf', contentType: 'application/pdf', sizeBytes: 2000, issuedOn: '2026-11-20', doctor: 'Dra. Y', description: 'Liberada', submittedAt: Timestamp.fromDate(new Date('2026-11-21T10:00:00Z')) },
      clearanceDecidedByName: '', clearanceNote: '',
    });
    expect(r.requireClearance).toBeTrue();
    expect(r.clearanceStatus).toBe('submitted');
    expect(r.awaitingClearance).toBeTrue();
    expect(r.clearance?.fileName).toBe('alta.pdf');
    expect(r.clearance?.submittedAt?.toISOString()).toBe('2026-11-21T10:00:00.000Z');
    expect(readEnrollmentRequest('r5', { clearanceStatus: 'weird', clearance: { fileName: 'sem path' } }).clearanceStatus).toBe('');
    expect(readEnrollmentRequest('r5', { clearance: { fileName: 'sem path' } }).clearance).toBeNull();
  });
});

describe('readInvoice (desconto do ciclo)', () => {
  it('lê o desconto de retenção e ignora ausente ou zerado', () => {
    expect(readInvoice('i1', { amountCents: 20000, discount: { percent: 20, fullCents: 25000, reason: 'retention' } }).discount).toEqual({ percent: 20, fullCents: 25000, reason: 'retention' });
    expect(readInvoice('i2', { amountCents: 25000 }).discount).toBeNull();
    expect(readInvoice('i3', { discount: { percent: 0 } }).discount).toBeNull();
  });
});
