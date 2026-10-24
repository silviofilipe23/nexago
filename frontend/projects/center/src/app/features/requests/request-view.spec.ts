import { DEFAULT_POLICIES, type Enrollment, type EnrollmentRequest } from '../../domain/models';
import {
  canAskDocument,
  canClear,
  canDecide,
  clearLabel,
  clearanceView,
  canUndo,
  cancelTimeline,
  certificateKind,
  countByFilter,
  deskDraftError,
  eligibleEnrollments,
  filterRequests,
  needsReview,
  openRequestFor,
  pauseBanners,
  pauseDaysUsed,
  pauseEffects,
  requestErrorMessage,
  requestPeriod,
  requestReason,
  requestSituation,
  requestStats,
  retentionRows,
  waitlistFor,
} from './request-view';

const TZ = 'America/Sao_Paulo';

function rq(id: string, over: Partial<EnrollmentRequest> = {}): EnrollmentRequest {
  return {
    id, enrollmentId: 'e' + id, studentId: 's' + id, studentUid: 'u' + id, studentName: 'Carla Dias', classId: 'k1', className: 'BT Manhã',
    planName: 'Mensal 2x', planType: 'monthly', priceCents: 25000, type: 'pause', status: 'scheduled', source: 'app', reason: 'Viagem',
    comment: '', startsOn: '2026-11-01', endsOn: '2026-11-30', pausedUntil: '2026-12-01', days: 30, overLimit: false, certificate: null,
    requireClearance: false, clearanceStatus: '', clearance: null, awaitingClearance: false, releaseSeat: false, awaitingSeat: false, clearanceDecidedAt: null, clearanceDecidedByName: '', clearanceNote: '',
    lastDay: '', cancelAt: '', retention: null, effectiveFrom: '', createdAt: new Date('2026-10-20T15:00:00Z'), createdByName: 'Carla Dias',
    decidedAt: null, decidedByName: '', decisionNote: '', appliedAt: null, updatedAt: null,
    ...over,
  };
}

function enr(id: string, over: Partial<Enrollment> = {}): Enrollment {
  return {
    id, studentId: 's' + id, studentName: 'Aluno ' + id, classId: 'k1', className: 'BT Manhã', planId: 'p', contract: null, status: 'active',
    startDate: '2026-01-10', holdUntil: null, pausedUntil: null, pauseReason: '', creditsLeft: null, waitlistedAt: null, offeredAt: null,
    offeredAuto: false, notifyOnSeat: false, seatReleased: false, awaitingSeat: false, endedAt: null, createdAt: null, createdByName: '',
    ...over,
  };
}

describe('request-view', () => {
  const injury = rq('1', {
    type: 'injury', status: 'pending', reason: 'Entorse no joelho', startsOn: '2026-10-24', endsOn: '2026-11-22', pausedUntil: '2026-11-23',
    certificate: { path: 'x/a.pdf', fileName: 'a.pdf', contentType: 'application/pdf', sizeBytes: 1, issuedOn: '2026-10-23', daysOff: 30, doctor: '', description: 'Entorse' },
  });
  const cancel = rq('2', {
    type: 'cancel', status: 'scheduled', reason: 'moving', comment: 'Vou para BH', startsOn: '', endsOn: '', pausedUntil: '', days: 0,
    lastDay: '2026-11-19', cancelAt: '2026-11-20', retention: { offered: ['pause', 'plan_change'], accepted: null, planName: '', priceCents: null, percent: null },
    createdAt: new Date('2026-10-23T21:30:00Z'),
  });
  const retained = rq('3', {
    type: 'cancel', status: 'retained', reason: 'price', createdAt: new Date('2026-10-22T12:00:00Z'),
    retention: { offered: ['plan_change'], accepted: 'plan_change', planName: '1x/semana', priceCents: 18000, percent: null },
  });
  const pause = rq('4');
  const activeInjury = rq('5', { type: 'injury', status: 'active', startsOn: '2026-10-10', endsOn: '2026-10-24', pausedUntil: '2026-10-25' });
  const oldCancel = rq('6', { type: 'cancel', status: 'done', reason: 'schedule', lastDay: '2026-09-30', createdAt: new Date('2026-08-31T12:00:00Z') });
  const list = [injury, cancel, retained, pause, activeInjury, oldCancel];

  it('filtra por revisão e por tipo e conta os chips', () => {
    expect(filterRequests(list, 'review').map((r) => r.id)).toEqual(['1']);
    expect(filterRequests(list, 'injury').map((r) => r.id)).toEqual(['1', '5']);
    expect(filterRequests(list, 'cancel').map((r) => r.id)).toEqual(['2', '3', '6']);
    expect(filterRequests(list, 'all').length).toBe(6);
    expect(countByFilter(list)).toEqual({ all: 6, review: 1, injury: 2, pause: 1, cancel: 3 });
  });

  it('motivo, período e situação de cada tipo', () => {
    expect(requestReason(injury)).toBe('Entorse no joelho · atestado 30 dias');
    expect(requestReason(cancel)).toBe('Mudança de cidade');
    expect(requestReason(pause)).toBe('Viagem');
    expect(requestPeriod(pause)).toBe('01 nov → 30 nov');
    expect(requestPeriod(cancel)).toBe('Último dia 19 nov');
    expect(requestPeriod(oldCancel)).toBe('Encerrado 30 set');
    expect(requestPeriod(retained)).toBe('—');
    expect(requestSituation(injury)).toEqual({ label: 'Atestado para revisar', tone: 'yellow' });
    expect(requestSituation({ ...injury, overLimit: true }).label).toContain('acima do limite');
    expect(requestSituation(cancel).tone).toBe('orange');
    expect(requestSituation(retained)).toEqual({ label: 'Aceitou troca para 1x/semana', tone: 'green' });
    expect(requestSituation(activeInjury).label).toBe('Pausado · volta 25 out');
  });

  it('números do topo: revisar, pausados, em aviso e retidos do mês', () => {
    const s = requestStats(list, '2026-10', TZ);
    expect(s.review).toBe(1);
    expect(s.reviewSub).toBe('1 atestado');
    expect(s.pausedNow).toBe(1);
    expect(s.pausedSub).toBe('1 lesão · 0 trancamento');
    expect(s.cancelNotice).toBe(1);
    expect(s.cancelSub).toBe('vagas liberam até 19 nov');
    expect(s.retained).toBe(1);
    expect(s.cancelsInMonth).toBe(2);
    expect(s.retainedSub).toBe('50% dos pedidos de cancelamento');
  });

  it('o mês dos retidos usa o fuso do centro', () => {
    const lateNight = rq('7', { type: 'cancel', status: 'retained', createdAt: new Date('2026-11-01T02:00:00Z') });
    expect(requestStats([lateNight], '2026-10', TZ).retained).toBe(1);
    expect(requestStats([lateNight], '2026-11', TZ).retained).toBe(0);
  });

  it('ações: decidir, pedir documento e desfazer', () => {
    expect(canDecide(injury)).toBeTrue();
    expect(canDecide({ ...injury, status: 'needs_document' })).toBeTrue();
    expect(canAskDocument({ ...injury, status: 'needs_document' })).toBeFalse();
    expect(canDecide(cancel)).toBeFalse();
    expect(canUndo(pause, '2026-10-24')).toBeTrue();
    expect(canUndo(cancel, '2026-11-19')).toBeTrue();
    expect(canUndo(cancel, '2026-11-20')).toBeFalse();
    expect(canUndo(activeInjury, '2026-10-20')).toBeFalse();
  });

  it('pedido em andamento por matrícula', () => {
    expect(openRequestFor(list, 'e2')?.id).toBe('2');
    expect(openRequestFor(list, 'e3')).toBeNull();
  });

  it('dias usados no ano espelham o servidor (lesão só quando conta)', () => {
    const same = [rq('a', { enrollmentId: 'x', days: 10, status: 'done' }), rq('b', { enrollmentId: 'x', type: 'injury', days: 20, status: 'active' }),
      rq('c', { enrollmentId: 'x', days: 5, status: 'rejected' }), rq('d', { enrollmentId: 'x', days: 7, startsOn: '2025-12-01', status: 'done' })];
    expect(pauseDaysUsed(same, 'x', '2026', false)).toBe(10);
    expect(pauseDaysUsed(same, 'x', '2026', true)).toBe(30);
    expect(pauseDaysUsed(same, 'x', '2026', true, 'b')).toBe(10);
  });

  it('faixas da pausa: limite da lesão e se conta no limite do ano', () => {
    const b = pauseBanners({ ...injury, overLimit: true }, DEFAULT_POLICIES, 10);
    expect(b.map((x) => x.title)).toEqual(['Afastamento acima de 90 dias', 'Pausa por lesão não conta no limite de trancamento']);
    expect(b[1]!.text).toBe('Carla tem 20 dias de trancamento livres no ano.');
    const counted = pauseBanners(injury, { ...DEFAULT_POLICIES, injuryCountsInLimit: true }, 10);
    expect(counted[0]!.title).toBe('Pausa por lesão conta no limite de trancamento');
  });

  it('linha do tempo e ofertas do cancelamento', () => {
    expect(cancelTimeline(cancel, TZ)).toEqual([
      { day: '23 out', label: 'Pedido', last: false },
      { day: '19 nov', label: 'Último dia', last: false },
      { day: '20 nov', label: 'Vencimento não cobrado', last: true },
    ]);
    expect(retentionRows(cancel)).toEqual([
      { offer: 'Trancar a matrícula', outcome: 'Recusou' },
      { offer: 'Trocar de plano', outcome: 'Recusou' },
    ]);
    expect(retentionRows(retained)).toEqual([{ offer: 'Trocar para 1x/semana', outcome: 'Aceitou' }]);
  });

  describe('alta médica na pausa por lesão', () => {
    const base = { type: 'injury' as const, status: 'active' as const, requireClearance: true, startsOn: '2026-10-10', endsOn: '2026-10-24', pausedUntil: '2026-10-25' };
    const waiting = rq('c1', { ...base, clearanceStatus: '' });
    const asked = rq('c2', { ...base, clearanceStatus: 'requested' });
    const sent = rq('c3', { ...base, clearanceStatus: 'submitted' });
    const held = rq('c4', { ...base, clearanceStatus: 'requested', awaitingClearance: true, pausedUntil: '2026-10-27' });
    const heldSent = rq('c5', { ...base, clearanceStatus: 'submitted', awaitingClearance: true });
    const approved = rq('c6', { ...base, clearanceStatus: 'approved', clearanceDecidedByName: 'Ana' });

    it('alta enviada ou pausa segurada entram em Para revisar e no número do topo', () => {
      const all = [injury, waiting, asked, sent, held, heldSent, approved];
      expect(filterRequests(all, 'review').map((r) => r.id)).toEqual(['1', 'c3', 'c4', 'c5']);
      expect(countByFilter(all).review).toBe(4);
      const s = requestStats(all, '2026-10', TZ);
      expect(s.review).toBe(4);
      expect(s.reviewSub).toBe('1 atestado · 3 altas médicas');
      expect(requestStats([held], '2026-10', TZ).reviewSub).toBe('1 alta médica');
      expect(filterRequests([{ ...sent, requireClearance: false }], 'review')).toEqual([]);
    });

    it('situação na lista', () => {
      expect(requestSituation(waiting).label).toBe('Pausado · volta 25 out');
      expect(requestSituation(asked).label).toBe('Pausado · alta pedida · volta 25 out');
      expect(requestSituation(sent)).toEqual({ label: 'Alta enviada para revisar · volta 25 out', tone: 'yellow' });
      expect(requestSituation(held).label).toBe('Aguardando alta · pausa segue até liberar');
      expect(requestSituation(heldSent).label).toBe('Alta enviada · pausa segue até liberar');
      expect(requestSituation(approved).label).toBe('Pausado · volta 25 out');
    });

    it('bloco do detalhe, botão e volta', () => {
      expect(clearanceView(rq('n', { type: 'injury', status: 'active' }))).toBeNull();
      expect(clearanceView(waiting)).toEqual({ label: 'Alta exigida', tone: 'dim', text: 'O app pede a alta em 21 out, 3 dias antes do fim. Sem alta aprovada, a pausa segue depois de 24 out.' });
      expect(clearanceView(asked)!.label).toBe('Alta pedida');
      expect(clearanceView(sent)!.tone).toBe('yellow');
      expect(clearanceView(held)).toEqual({ label: 'Aguardando alta', tone: 'orange', text: 'A pausa terminou em 24 out e segue até liberar. O aluno ainda não enviou a alta.' });
      expect(clearanceView(approved)!.label).toBe('Volta liberada sem alta');
      expect(canClear(held)).toBeTrue();
      expect(canClear(approved)).toBeFalse();
      expect(canClear({ ...held, status: 'done' })).toBeFalse();
      expect(clearLabel(sent)).toBe('Aprovar alta');
      expect(clearLabel(held)).toBe('Liberar sem alta');
      expect(pauseEffects(asked).find((kv) => kv[0] === 'Volta')![1]).toBe('Só com a alta aprovada · previsão 25 out');
      expect(pauseEffects(held).find((kv) => kv[0] === 'Volta')![1]).toBe('Segue pausada até a alta ser aprovada');
      expect(pauseEffects(approved).find((kv) => kv[0] === 'Volta')![1]).toBe('Matrícula reativa sozinha em 25 out');
    });
  });

  it('trancamento que libera a vaga: agenda, pausa e volta com a turma cheia', () => {
    const scheduled = rq('v1', { releaseSeat: true });
    expect(requestSituation(scheduled).label).toBe('Agendado para 01 nov · vaga será liberada');
    expect(pauseEffects(scheduled).find((kv) => kv[0] === 'Vaga')![1]).toBe('Vaga liberada para a turma · a lista de espera recebe a oferta');
    expect(pauseEffects(scheduled).find((kv) => kv[0] === 'Volta')![1]).toContain('antes da fila');
    expect(pauseEffects(rq('v0')).find((kv) => kv[0] === 'Vaga')![1]).toBe('Reservada · não vai para a lista de espera');

    const paused = rq('v2', { status: 'active', releaseSeat: true });
    expect(requestSituation(paused)).toEqual({ label: 'Pausado · vaga liberada · volta 01 dez', tone: 'blue' });

    const full = rq('v3', { status: 'active', releaseSeat: true, awaitingSeat: true, pausedUntil: '2026-12-02' });
    expect(requestSituation(full)).toEqual({ label: 'Turma cheia · volta na primeira vaga', tone: 'orange' });
    expect(pauseEffects(full).find((kv) => kv[0] === 'Volta')![1]).toBe('Turma cheia · segue pausada sem cobrança e volta na primeira vaga, antes da fila');
    // Conta em "Pausados agora", não em "Para revisar".
    expect(needsReview(full)).toBeFalse();
    const st = requestStats([paused, full], '2026-10', TZ);
    expect(st.pausedNow).toBe(2);
    expect(st.review).toBe(0);
    expect(st.pausedSub).toBe('0 lesão · 2 trancamento · 1 esperando vaga');
    expect(pauseBanners(full, DEFAULT_POLICIES, 30)[0]!.title).toBe('Turma cheia na volta');
    expect(pauseBanners(paused, DEFAULT_POLICIES, 30).some((b) => b.title === 'Turma cheia na volta')).toBeFalse();
  });

  it('cancelamento retido com desconto de 1 mês conta nos retidos', () => {
    const disc = rq('d1', {
      type: 'cancel', status: 'retained', reason: 'price', effectiveFrom: '2026-11-10', createdAt: new Date('2026-10-22T12:00:00Z'),
      retention: { offered: ['pause', 'discount'], accepted: 'discount', planName: '', priceCents: 20000, percent: 20 },
    });
    expect(requestSituation(disc)).toEqual({ label: 'Aceitou 20% de desconto', tone: 'green' });
    expect(retentionRows(disc)).toEqual([
      { offer: 'Trancar a matrícula', outcome: '—' },
      { offer: 'Desconto de 20% em 1 mensalidade', outcome: 'Aceitou' },
    ]);
    const s = requestStats([retained, disc, cancel], '2026-10', TZ);
    expect(s.retained).toBe(2);
    expect(s.cancelsInMonth).toBe(3);
  });

  it('lista de espera da turma em ordem de chegada', () => {
    const q = [
      enr('a', { status: 'waitlisted', waitlistedAt: new Date('2026-10-21T10:00:00Z') }),
      enr('b', { status: 'waitlisted', waitlistedAt: new Date('2026-10-02T10:00:00Z') }),
      enr('c', { status: 'active' }),
      enr('d', { status: 'waitlisted', classId: 'k2' }),
    ];
    expect(waitlistFor(q, 'k1').map((e) => e.id)).toEqual(['b', 'a']);
  });

  it('balcão: matrículas elegíveis e validação', () => {
    const es = [enr('1'), enr('2', { status: 'paused' }), enr('9', { contract: { planName: 'Pacote', planType: 'class_pack', priceCents: 0, classesPerWeek: null, makeupsPerMonth: null, credits: 8, validityDays: 60, policies: DEFAULT_POLICIES, contractedAt: '' } })];
    const reqs = [rq('x', { enrollmentId: '1', status: 'active' })];
    expect(eligibleEnrollments(es, reqs, 'pause').map((e) => e.id)).toEqual([]);
    expect(eligibleEnrollments(es, [], 'pause').map((e) => e.id)).toEqual(['1']);
    expect(eligibleEnrollments(es, reqs, 'cancel').map((e) => e.id)).toEqual(['1', '2', '9']);

    const base = { enrollmentId: '1', type: 'pause' as const, startsOn: '2026-10-24', days: 10, reason: 'Viagem', comment: '' };
    expect(deskDraftError(base, DEFAULT_POLICIES, '2026-10-24')).toBeNull();
    expect(deskDraftError({ ...base, days: 5 }, DEFAULT_POLICIES, '2026-10-24')).toContain('mínimo');
    expect(deskDraftError({ ...base, startsOn: '2026-10-23' }, DEFAULT_POLICIES, '2026-10-24')).not.toBeNull();
    expect(deskDraftError({ ...base, type: 'injury', days: 5, reason: '' }, DEFAULT_POLICIES, '2026-10-24')).toBeNull();
    expect(deskDraftError({ ...base, type: 'cancel', reason: 'xx' }, DEFAULT_POLICIES, '2026-10-24')).toContain('motivo');
    expect(deskDraftError({ ...base, type: 'cancel', reason: 'price' }, DEFAULT_POLICIES, '2026-10-24')).toBeNull();
  });

  it('tipo do atestado e erro de callable', () => {
    expect(certificateKind('application/pdf')).toBe('pdf');
    expect(certificateKind('image/png')).toBe('image');
    expect(certificateKind('image/heic')).toBe('other');
    expect(requestErrorMessage(new Error('NOT FOUND'))).toContain('indisponíveis');
  });
});
