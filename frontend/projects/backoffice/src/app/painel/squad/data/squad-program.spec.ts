import {
  DAY_MS,
  DEFAULT_CYCLE,
  deriveStatus,
  dropAction,
  freeSeats,
  inviteNote,
  isValidCode,
  nextCycleStart,
  normalizeCode,
  roiTone,
  scoreTone,
  suggestTier,
  suggestedCodeFor,
  type StatusRules,
} from './squad-program';

// Espelho de `functions/src/squad-program.ts`: os mesmos casos de lá, para o espelho não divergir.
describe('squad-program (espelho das functions)', () => {
  const NOW = new Date('2026-10-17T15:00:00Z');
  const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY_MS);
  const RULES: StatusRules = {
    promotion: [
      { from: 'ath', minConversions: 10, minRoi: null },
      { from: 'amb', minConversions: 30, minRoi: 3 },
    ],
    termination: { maxRoi: 1.5 },
  };
  const base = { leadsGroup: null, referredCount: null, rankingPosition: null, followers: null, engagementPct: null, tournaments: null };

  it('código: normaliza, valida A–Z/0–9 4–12 e sugere PRIMEIRONOME10', () => {
    expect(normalizeCode(' joão 10 ')).toBe('JOAO10');
    expect(isValidCode('ABC')).toBeFalse();
    expect(isValidCode('JOAO-10')).toBeFalse();
    expect(suggestedCodeFor('Maximiliano Souza')).toBe('MAXIMILIAN10');
    expect(suggestedCodeFor('Ana Clara')).toBe('ANA10');
  });

  it('nível sugerido na ordem Captain → Pro → Ambassador → Athlete', () => {
    expect(suggestTier({ ...base, leadsGroup: 'gt30', followers: 80_000 })).toBe('cap');
    expect(suggestTier({ ...base, referredCount: 15 })).toBe('cap');
    expect(suggestTier({ ...base, rankingPosition: 10 })).toBe('pro');
    expect(suggestTier({ ...base, tournaments: 8, engagementPct: 4 })).toBe('amb');
    expect(suggestTier({ ...base, tournaments: 7, followers: 30_000 })).toBe('ath');
  });

  it('status derivado: prioridade e os 30 primeiros dias', () => {
    const status = (over: Partial<Parameters<typeof deriveStatus>[0]>) =>
      deriveStatus({ state: 'active', tier: 'amb', start: daysAgo(60), conversions: 20, roi: 3, rules: RULES, now: NOW, ...over });
    expect(status({ state: 'paused', roi: 0.5 })).toBe('paused');
    expect(status({ roi: 1.2 })).toBe('at_risk');
    expect(status({ start: daysAgo(10), roi: 1.2, conversions: 0 })).toBe('active_start');
    expect(status({ conversions: 30, roi: 3.2 })).toBe('eligible');
    expect(status({ conversions: 9 })).toBe('below_goal');
    expect(status({ conversions: 10 })).toBe('active');
  });

  it('cores de ROI e Score', () => {
    expect(roiTone(null)).toBe('none');
    expect(roiTone(4)).toBe('green');
    expect(roiTone(2.5)).toBe('neutral');
    expect(roiTone(2.4)).toBe('red');
    expect(scoreTone(75)).toBe('hot');
    expect(scoreTone(55)).toBe('warm');
    expect(scoreTone(54)).toBe('red');
  });

  it('ciclo, vagas e colunas vizinhas', () => {
    expect(nextCycleStart(DEFAULT_CYCLE)).toBe('2026-12-07');
    expect(freeSeats(DEFAULT_CYCLE, 20, 0)).toBe(0);
    expect(dropAction('new', 'review')).toBe('review');
    expect(dropAction('review', 'invited')).toBe('invite');
    expect(dropAction('new', 'invited')).toBeNull();
  });

  it('nota automática do convite', () => {
    const clock = { sentAt: daysAgo(3), openedAt: null, expiresAt: null, scheduledFor: null, reminders: [] };
    expect(inviteNote({ ...clock, status: 'sent' }, NOW)).toBe('Convite enviado há 3 dias · ainda não abriu');
    expect(inviteNote({ ...clock, status: 'opened', openedAt: daysAgo(0) }, NOW)).toBe(
      'Aguardando assinatura · lembrete automático amanhã',
    );
  });
});
