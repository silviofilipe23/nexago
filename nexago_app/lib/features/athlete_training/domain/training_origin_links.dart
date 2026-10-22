import '../../../core/formatting/app_currency_format.dart';
import 'athlete_training.dart';
import 'class_presence.dart';
import 'training_center.dart';
import 'training_plans.dart';

/// "Onde eu treino" (O1): um cartão por vínculo — cada professor particular,
/// cada matrícula em turma de arena e cada centro de treinamento — com a
/// próxima aula, quem cobra e um aviso.

enum TrainingLinkNoticeTone { info, warning, danger }

class TrainingOriginLink {
  const TrainingOriginLink({
    required this.origin,
    required this.id,
    required this.name,
    required this.subtitle,
    required this.next,
    required this.plan,
    this.notice,
    this.noticeTone = TrainingLinkNoticeTone.info,
  });

  final TrainingOrigin origin;

  /// `professorUid`, `enrollmentId` da arena ou `centerId`.
  final String id;
  final String name;
  final String subtitle;
  final String next;
  final String plan;
  final String? notice;
  final TrainingLinkNoticeTone noticeTone;
}

bool trainingMatchesOriginLink(TrainingOriginLink l, TrainingOrigin? origin) =>
    origin == null || l.origin == origin;

/// Monta os vínculos na ordem Particular · Arena · Centro. [upcoming] já vem
/// em ordem cronológica e sem cancelados.
List<TrainingOriginLink> trainingOriginLinks({
  required List<TrainingSession> upcoming,
  required MyTrainingPlans? plans,
  required List<TrainingCenterLink> centers,
  required List<ClassMakeupCredit> credits,
  required String todayKey,
}) {
  final out = <TrainingOriginLink>[];

  // Particular: professores da carteira + quem tem particular marcada.
  final professorPlans = {
    for (final p in plans?.professorPlans ?? const <ProfessorTrainingPlan>[])
      p.professorUid: p,
  };
  final privateNames = <String, String>{};
  for (final t in upcoming) {
    if (t.isPrivate && t.professorUid.isNotEmpty) {
      privateNames.putIfAbsent(t.professorUid, () => t.professorName);
    }
  }
  final uids = {...professorPlans.keys, ...privateNames.keys};
  for (final uid in uids) {
    final p = professorPlans[uid];
    final next = _first(upcoming, (t) => t.isPrivate && t.professorUid == uid);
    out.add(
      TrainingOriginLink(
        origin: TrainingOrigin.private,
        id: uid,
        name: p?.professorName ?? privateNames[uid] ?? 'Professor',
        subtitle: 'Professor particular · independente',
        next: _nextLabel(next, todayKey),
        plan: p == null
            ? 'Por aula'
            : p.recurringReais != null
            ? '${p.planName ?? 'Mensal'} · ${formatBRL(p.recurringReais!)}/mês'
            : p.planName ?? trainingPlanKindLabel(p.kind),
        notice: next?.state == TrainingState.awaitingProfessor
            ? 'Aguardando o professor confirmar'
            : null,
        noticeTone: TrainingLinkNoticeTone.warning,
      ),
    );
  }

  for (final p in plans?.arenaPlans ?? const <ArenaTrainingPlan>[]) {
    final next = _first(upcoming, (t) => trainingBelongsToArenaPlan(t, p));
    final mine = credits.where(
      (c) => p.arenaId.isEmpty
          ? c.arenaName == p.arenaName
          : c.arenaId == p.arenaId,
    );
    final teacher = p.slots
        .map((s) => s.teacherName)
        .firstWhere((n) => n.isNotEmpty, orElse: () => '');
    final className = p.slots.isEmpty ? p.planName : p.slots.first.className;
    final schedule = arenaPlanScheduleLabel(p.slots);
    out.add(
      TrainingOriginLink(
        origin: TrainingOrigin.arena,
        id: p.enrollmentId,
        name: p.arenaName,
        subtitle: [
          'Turma $className',
          if (teacher.isNotEmpty) 'Prof. ${trainingFirstName(teacher)}',
        ].join(' · '),
        next: _nextLabel(next, todayKey),
        plan: [p.planName, if (schedule.isNotEmpty) schedule].join(' · '),
        notice: mine.isEmpty
            ? null
            : mine.length == 1
            ? '1 reposição livre'
            : '${mine.length} reposições livres',
      ),
    );
  }

  for (final c in centers) {
    final next = _first(
      upcoming,
      (t) => t.isCenter && t.centerId == c.centerId,
    );
    final moved = _first(
      upcoming,
      (t) => t.isCenter && t.centerId == c.centerId && t.locationChanged,
    );
    final e = c.enrollments.isEmpty ? null : c.enrollments.first;
    final coaches = c.coachNames.length;
    final open = c.openInvoices;
    final overdue = open.any((i) => i.isOverdue(todayKey));
    final String? notice;
    final TrainingLinkNoticeTone tone;
    if (overdue || c.billingHold) {
      notice = 'Mensalidade vencida';
      tone = TrainingLinkNoticeTone.danger;
    } else if (moved != null) {
      notice = 'Local muda ${_relative(moved.dateKey, todayKey)}';
      tone = TrainingLinkNoticeTone.warning;
    } else if (open.isNotEmpty) {
      notice = 'Mensalidade em aberto';
      tone = TrainingLinkNoticeTone.warning;
    } else if (e != null && e.status != 'active') {
      final label = centerEnrollmentStatusLabel(e).toLowerCase();
      notice = 'Matrícula ${label == 'na fila' ? 'na fila de espera' : label}';
      tone = TrainingLinkNoticeTone.warning;
    } else {
      notice = null;
      tone = TrainingLinkNoticeTone.info;
    }
    out.add(
      TrainingOriginLink(
        origin: TrainingOrigin.center,
        id: c.centerId,
        name: c.name,
        subtitle: [
          if (e != null) e.className,
          if (coaches > 1)
            '$coaches professores'
          else if (coaches == 1)
            'Prof. ${trainingFirstName(c.coachNames.first)}',
        ].join(' · '),
        next: _nextLabel(next, todayKey),
        plan: e == null
            ? 'Sem matrícula ativa'
            : '${centerPlanSummary(e)} · '
                  '${formatBRL(e.priceReais)}${e.isPack ? '' : '/mês'}',
        notice: notice,
        noticeTone: tone,
      ),
    );
  }
  return out;
}

TrainingSession? _first(
  List<TrainingSession> list,
  bool Function(TrainingSession) test,
) {
  for (final t in list) {
    if (test(t)) return t;
  }
  return null;
}

/// "Amanhã · 19:00 · Quadra 2" ou "Sem aula marcada".
String _nextLabel(TrainingSession? t, String todayKey) {
  if (t == null) return 'Sem aula marcada';
  final place = t.courtName.isNotEmpty ? t.courtName : t.arenaName;
  return [
    _relative(t.dateKey, todayKey),
    t.startTime,
    if (place.isNotEmpty) place,
  ].join(' · ');
}

/// "Hoje", "Amanhã" ou "Qui 23".
String _relative(String dateKey, String todayKey) {
  final r = trainingRelativeDay(dateKey, todayKey);
  if (r == 'Hoje' || r == 'Amanhã' || r.length < 2) return r;
  return r[0] + r.substring(1).toLowerCase();
}
