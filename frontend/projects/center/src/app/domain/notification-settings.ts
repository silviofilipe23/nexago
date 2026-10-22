/**
 * Preferências de aviso do centro — espelho de `functions/src/training-center-notification-settings-model.ts`
 * (mesmos padrões e limites), mais os textos da tela Configurações › Notificações.
 */

export type NotificationEventKey =
  | 'class_reminder'
  | 'session_cancelled'
  | 'session_changed'
  | 'attendance_pending'
  | 'seat_offered'
  | 'enrollment_confirmed'
  | 'makeup_expiring'
  | 'billing_reminder'
  | 'billing_overdue'
  | 'payment_confirmed'
  | 'billing_block_warning'
  | 'staff_pending_payments'
  | 'daily_summary';

export interface QuietHours {
  enabled: boolean;
  start: string;
  end: string;
}

export interface NotificationSettings {
  push: Record<NotificationEventKey, boolean>;
  quietHours: QuietHours;
  reminderLeadMin: number;
}

interface EventSpec {
  mandatory: boolean;
  defaultPush: boolean;
  available: boolean;
}

const spec = (p: Partial<EventSpec>): EventSpec => ({ mandatory: false, defaultPush: true, available: true, ...p });

export const EVENT_SPECS: Record<NotificationEventKey, EventSpec> = {
  class_reminder: spec({}),
  session_cancelled: spec({ mandatory: true }),
  session_changed: spec({ mandatory: true }),
  attendance_pending: spec({}),
  seat_offered: spec({}),
  enrollment_confirmed: spec({}),
  makeup_expiring: spec({ available: false }),
  billing_reminder: spec({ mandatory: true }),
  billing_overdue: spec({ mandatory: true }),
  payment_confirmed: spec({ defaultPush: false }),
  billing_block_warning: spec({}),
  staff_pending_payments: spec({}),
  daily_summary: spec({ defaultPush: false, available: false }),
};

export const REMINDER_LEADS = [60, 120, 180, 240];
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = readNotificationSettings(null);

export function readNotificationSettings(raw: Record<string, unknown> | null): NotificationSettings {
  const d = raw ?? {};
  const events = d['events'] && typeof d['events'] === 'object' ? (d['events'] as Record<string, unknown>) : {};
  const push = {} as Record<NotificationEventKey, boolean>;
  for (const [key, s] of Object.entries(EVENT_SPECS) as [NotificationEventKey, EventSpec][]) {
    const e = events[key] && typeof events[key] === 'object' ? (events[key] as Record<string, unknown>) : {};
    push[key] = s.mandatory ? true : typeof e['push'] === 'boolean' ? (e['push'] as boolean) : s.defaultPush;
  }
  const q = d['quietHours'] && typeof d['quietHours'] === 'object' ? (d['quietHours'] as Record<string, unknown>) : {};
  const lead = Number(d['reminderLeadMin']);
  return {
    push,
    quietHours: {
      enabled: q['enabled'] !== false,
      start: typeof q['start'] === 'string' && TIME.test(q['start']) ? q['start'] : '22:00',
      end: typeof q['end'] === 'string' && TIME.test(q['end']) ? q['end'] : '07:00',
    },
    reminderLeadMin: REMINDER_LEADS.includes(lead) ? lead : 120,
  };
}

/** Como o doc guarda (só o que o centro decide; obrigatórios não precisam ir). */
export function toFirestore(s: NotificationSettings): Record<string, unknown> {
  const events: Record<string, { push: boolean }> = {};
  for (const [key, on] of Object.entries(s.push) as [NotificationEventKey, boolean][]) {
    if (!EVENT_SPECS[key].mandatory) events[key] = { push: on };
  }
  return { events, quietHours: { ...s.quietHours }, reminderLeadMin: s.reminderLeadMin };
}

export function settingsError(s: NotificationSettings): string | null {
  if (s.quietHours.enabled && (!TIME.test(s.quietHours.start) || !TIME.test(s.quietHours.end))) {
    return 'Informe o horário de silêncio como HH:MM.';
  }
  if (s.quietHours.enabled && s.quietHours.start === s.quietHours.end) {
    return 'O silêncio precisa começar e terminar em horários diferentes.';
  }
  return null;
}

/** Diferenças legíveis para a auditoria. */
export function settingsChanges(before: NotificationSettings, next: NotificationSettings): string[] {
  const out: string[] = [];
  for (const key of Object.keys(next.push) as NotificationEventKey[]) {
    if (before.push[key] !== next.push[key]) {
      out.push(`${EVENT_LABEL[key]}: push ${next.push[key] ? 'ligado' : 'desligado'}`);
    }
  }
  const bq = before.quietHours;
  const nq = next.quietHours;
  if (bq.enabled !== nq.enabled || bq.start !== nq.start || bq.end !== nq.end) {
    out.push(nq.enabled ? `Silêncio ${nq.start}–${nq.end}` : 'Silêncio desligado');
  }
  if (before.reminderLeadMin !== next.reminderLeadMin) {
    out.push(`Lembrete de aula: ${next.reminderLeadMin / 60}h antes`);
  }
  return out;
}

export const EVENT_LABEL: Record<NotificationEventKey, string> = {
  class_reminder: 'Lembrete de aula',
  session_cancelled: 'Aula cancelada',
  session_changed: 'Local ou horário alterado',
  attendance_pending: 'Chamada não finalizada',
  seat_offered: 'Vaga liberada na lista de espera',
  enrollment_confirmed: 'Matrícula confirmada',
  makeup_expiring: 'Crédito de reposição vencendo',
  billing_reminder: 'Lembrete de cobrança',
  billing_overdue: 'Pagamento em atraso',
  payment_confirmed: 'Pagamento confirmado',
  billing_block_warning: 'Aviso de bloqueio do check-in',
  staff_pending_payments: 'Pagamentos sem confirmação',
  daily_summary: 'Resumo diário',
};

export interface EventRow {
  key: NotificationEventKey;
  label: string;
  when: string;
  who: string;
}

/** Linhas da tela, em grupos (protótipo W4b). `when` depende da política do centro. */
export function eventGroups(ctx: { reminderLeadMin: number; waitlistAcceptHours: number; blockAfterDays: number }): {
  title: string;
  rows: EventRow[];
}[] {
  const row = (key: NotificationEventKey, when: string, who: string): EventRow => ({ key, label: EVENT_LABEL[key], when, who });
  const lead = ctx.reminderLeadMin / 60;
  return [
    {
      title: 'Aulas',
      rows: [
        row('class_reminder', `${lead}h antes · com local e endereço`, 'Aluno'),
        row('session_cancelled', 'Na hora · inclui motivo e reposição gerada', 'Aluno · Professor'),
        row('session_changed', 'Na hora · novo endereço ou horário', 'Aluno · Professor'),
        row('attendance_pending', '30 min após o fim da aula', 'Professor'),
      ],
    },
    {
      title: 'Matrículas',
      rows: [
        row('seat_offered', `Prazo de ${ctx.waitlistAcceptHours}h para aceitar`, 'Aluno'),
        row('enrollment_confirmed', 'Após o pagamento aprovado', 'Aluno'),
        row('makeup_expiring', '3 dias antes', 'Aluno'),
      ],
    },
    {
      title: 'Cobrança',
      rows: [
        row('billing_reminder', 'D−3 · valor e link de pagamento', 'Pagador'),
        row('billing_overdue', 'D+1, D+7, check-in bloqueado e suspensão', 'Pagador'),
        row('payment_confirmed', 'Recibo na aprovação', 'Pagador'),
        row(
          'billing_block_warning',
          ctx.blockAfterDays > 0 ? `D+${Math.max(1, ctx.blockAfterDays - 5)}` : 'Sem bloqueio na política',
          'Pagador',
        ),
      ],
    },
    {
      title: 'Equipe',
      rows: [
        row('staff_pending_payments', 'Mais de 2h aguardando o provedor', 'Owner · Admin'),
        row('daily_summary', '07:00 · aulas, pendências e recebidos', 'Owner'),
      ],
    },
  ];
}

/** Exemplo do push na pré-visualização (o mesmo texto do "Enviar teste para mim"). */
export const SAMPLE_NOTICES: Record<NotificationEventKey, { title: string; body: string }> = {
  class_reminder: { title: 'Aula hoje às 19:00 · BT Intermediário B', body: 'Local: Sede · Av. da Praia, 100' },
  session_cancelled: { title: 'Aula cancelada · BT Intermediário B', body: 'Qui 23 out 19:00 · chuva forte. Você ganhou 1 reposição.' },
  session_changed: { title: 'Local alterado · BT Intermediário B', body: 'Qui 23 out 19:00 · novo local: Arena Pepê.' },
  attendance_pending: { title: 'Chamada não finalizada', body: 'BT Intermediário B · Qui 23 out 19:00. Registre a presença.' },
  seat_offered: { title: 'Abriu uma vaga para você', body: 'BT Intermediário B · você tem 24h para confirmar.' },
  enrollment_confirmed: { title: 'Matrícula confirmada', body: 'BT Intermediário B · bons treinos!' },
  makeup_expiring: { title: 'Reposição vencendo', body: 'Sua reposição vence em 3 dias.' },
  billing_reminder: { title: 'Mensalidade de novembro · R$ 320,00', body: 'A mensalidade vence em 3 dias. Toque para pagar com Pix ou cartão.' },
  billing_overdue: { title: 'Mensalidade de novembro em aberto', body: 'Ainda não identificamos o pagamento de R$ 320,00. Toque para pagar.' },
  payment_confirmed: { title: 'Pagamento confirmado · R$ 320,00', body: 'Mensal 2x · nov. Obrigado!' },
  billing_block_warning: { title: 'Check-in vai ser bloqueado', body: 'A mensalidade de novembro segue em aberto. O check-in bloqueia em 25/11.' },
  staff_pending_payments: { title: '2 pagamentos sem confirmação há mais de 2h', body: 'R$ 640,00 aguardando o provedor. Confira no Financeiro.' },
  daily_summary: { title: 'Resumo do dia', body: '12 aulas hoje · 3 cobranças pendentes · R$ 960 recebidos ontem.' },
};
