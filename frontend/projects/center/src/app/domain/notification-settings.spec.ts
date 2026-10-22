import { eventGroups, readNotificationSettings, settingsChanges, settingsError, toFirestore } from './notification-settings';

describe('preferências de aviso (mesmas regras do servidor)', () => {
  it('padrões e obrigatórios sempre ligados', () => {
    const s = readNotificationSettings({ events: { session_cancelled: { push: false }, seat_offered: { push: false } } });
    expect(s.push.session_cancelled).toBeTrue();
    expect(s.push.seat_offered).toBeFalse();
    expect(s.push.payment_confirmed).toBeFalse();
    expect(s.quietHours).toEqual({ enabled: true, start: '22:00', end: '07:00' });
    expect(readNotificationSettings({ reminderLeadMin: 45 }).reminderLeadMin).toBe(120);
  });

  it('grava só o que o centro decide e descreve as mudanças', () => {
    const before = readNotificationSettings(null);
    const next = { ...before, push: { ...before.push, payment_confirmed: true }, reminderLeadMin: 60 };
    expect(Object.keys(toFirestore(next)['events'] as object)).not.toContain('billing_reminder');
    expect(settingsChanges(before, next)).toEqual(['Pagamento confirmado: push ligado', 'Lembrete de aula: 1h antes']);
    expect(settingsError({ ...next, quietHours: { enabled: true, start: '22:00', end: '22:00' } })).toContain('diferentes');
  });

  it('textos da tela seguem a política', () => {
    const g = eventGroups({ reminderLeadMin: 180, waitlistAcceptHours: 48, blockAfterDays: 0 });
    expect(g[0]!.rows[0]!.when).toContain('3h antes');
    expect(g[1]!.rows[0]!.when).toContain('48h');
    expect(g[2]!.rows[3]!.when).toBe('Sem bloqueio na política');
  });
});
