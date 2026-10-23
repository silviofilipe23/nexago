import 'center_coach.dart';
import 'center_finance.dart' show centerAgo;

/// G14 · Lista de espera no app (canvas `ct-gestao-b.jsx`). A oferta é
/// AUTOMÁTICA no servidor (`training-center-waitlist.ts`): abriu vaga, o 1º
/// da fila recebe a oferta com contrato e cobrança e tem as horas da política
/// para pagar; não pagou, a reserva vence e passa ao próximo. Aqui é a
/// leitura dessa fila por turma.

/// Ordem da fila: quem entrou primeiro (empate pelo id, como no servidor).
int _queueOrder(CenterCoachEnrollment a, CenterCoachEnrollment b) {
  final x = a.waitlistedAt, y = b.waitlistedAt;
  if (x != null && y != null && x != y) return x.compareTo(y);
  if (x != null && y == null) return -1;
  if (x == null && y != null) return 1;
  return a.id.compareTo(b.id);
}

class CenterWaitlistClass {
  const CenterWaitlistClass({
    required this.classId,
    required this.className,
    required this.queue,
    required this.offers,
    required this.past,
    this.cls,
  });

  final String classId;
  final String className;
  final CenterCoachClass? cls;

  /// Na fila, na ordem em que recebem a vaga.
  final List<CenterCoachEnrollment> queue;

  /// Vaga oferecida e ainda sem pagamento (pendente com prazo).
  final List<CenterCoachEnrollment> offers;

  /// Ofertas que já terminaram (aceitou ou passou a vez), mais recente primeiro.
  final List<CenterCoachEnrollment> past;

  int? get freeSeats {
    final c = cls;
    if (c == null || c.capacity <= 0) return null;
    return (c.capacity - c.seatsTaken).clamp(0, c.capacity);
  }
}

/// Turmas com fila ou oferta (em andamento ou nos últimos [pastDays] dias),
/// as com mais gente esperando primeiro.
List<CenterWaitlistClass> buildCenterWaitlist({
  required List<CenterCoachEnrollment> enrollments,
  required List<CenterCoachClass> classes,
  required DateTime now,
  int pastDays = 30,
}) {
  final byClass = <String, List<CenterCoachEnrollment>>{};
  for (final e in enrollments) {
    (byClass[e.classId] ??= []).add(e);
  }
  final since = now.subtract(Duration(days: pastDays));
  final out = <CenterWaitlistClass>[];
  for (final entry in byClass.entries) {
    final list = entry.value;
    final queue = [
      for (final e in list)
        if (e.status == 'waitlisted') e,
    ]..sort(_queueOrder);
    final offers = [
      for (final e in list)
        if (e.status == 'pending' && e.offeredAt != null) e,
    ]..sort((a, b) => a.offeredAt!.compareTo(b.offeredAt!));
    final past = [
      for (final e in list)
        if (e.offeredAt != null &&
            e.status != 'pending' &&
            e.offeredAt!.isAfter(since))
          e,
    ]..sort((a, b) => b.offeredAt!.compareTo(a.offeredAt!));
    if (queue.isEmpty && offers.isEmpty && past.isEmpty) continue;
    CenterCoachClass? cls;
    for (final c in classes) {
      if (c.id == entry.key) cls = c;
    }
    final first = list.first;
    out.add(
      CenterWaitlistClass(
        classId: entry.key,
        className:
            cls?.name ?? (first.className.isEmpty ? 'Turma' : first.className),
        cls: cls,
        queue: queue,
        offers: offers,
        past: past,
      ),
    );
  }
  out.sort((a, b) {
    final q = b.queue.length - a.queue.length;
    if (q != 0) return q;
    return a.className.compareTo(b.className);
  });
  return out;
}

String _dm(DateTime at, String Function(DateTime) localDayKey) {
  final d = localDayKey(at).split('-');
  return d.length == 3 ? '${d[2]}/${d[1]}' : '';
}

/// "Desde 18/10 · quer Mensal 2x".
String centerQueueLine(
  CenterCoachEnrollment e, {
  required Map<String, String> planNames,
  required String Function(DateTime) localDayKey,
}) {
  final plan = planNames[e.planId] ?? '';
  return [
    if (e.waitlistedAt != null) 'Desde ${_dm(e.waitlistedAt!, localDayKey)}',
    if (plan.isNotEmpty) 'quer $plan',
  ].join(' · ');
}

/// "Oferecida há 3h · paga até 24/10 16:15" (ou "prazo vencendo").
String centerOfferLine(
  CenterCoachEnrollment e, {
  required DateTime now,
  required String Function(DateTime) localDayKey,
  required String Function(DateTime) localHm,
}) {
  final parts = <String>[
    'Oferecida ${centerAgo(e.offeredAt!, now)}',
    if (e.offeredBy == 'manual') 'pela equipe',
  ];
  final hold = e.holdUntil;
  if (hold != null) {
    parts.add(
      hold.isAfter(now)
          ? 'paga até ${_dm(hold, localDayKey)} ${localHm(hold)}'
          : 'prazo vencendo',
    );
  }
  return parts.join(' · ');
}

/// Resultado da oferta: (texto, tom) — "Aceitou · oferta de 02/10" ou "Não
/// pagou no prazo · passou a vez · 28/09".
(String, String) centerPastOfferLine(
  CenterCoachEnrollment e, {
  required String Function(DateTime) localDayKey,
}) {
  final day = _dm(e.offeredAt!, localDayKey);
  if (e.cancelReason == 'hold_expired') {
    return ('Não pagou no prazo · passou a vez · $day', 'mute');
  }
  return switch (e.status) {
    'active' || 'paused' || 'completed' => (
        'Aceitou · oferta de $day',
        'green'
      ),
    'cancelled' => ('Desistiu depois da oferta · $day', 'mute'),
    _ => ('Oferta de $day', 'mute'),
  };
}

/// Total de pessoas na fila do centro.
int centerQueueSize(Iterable<CenterWaitlistClass> classes) =>
    classes.fold(0, (n, c) => n + c.queue.length);
