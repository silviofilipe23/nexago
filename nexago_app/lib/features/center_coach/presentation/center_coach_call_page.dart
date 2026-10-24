import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/navigation_helpers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/time/nexago_event_timezone.dart';
import '../../arena/domain/aulas/arena_class_logic.dart';
import '../../arena/presentation/aulas/widgets/arena_class_atoms.dart';
import '../../athlete_training/domain/athlete_training.dart'
    show trainingWeekdayDay;
import '../../professor_links/application/professor_links_providers.dart';
import '../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../professor_mode/presentation/widgets/professor_students_widgets.dart';
import '../application/center_coach_providers.dart';
import '../domain/center_coach.dart';
import '../domain/center_coach_repository.dart';
import '../infrastructure/firebase_center_coach_repository.dart';
import '../../professor_mode/presentation/availability/availability_widgets.dart';
import 'widgets/center_coach_widgets.dart';
import 'widgets/center_location_sheet.dart';
import 'center_coach_trial_review_page.dart' show centerCanEvaluateTrial;
import '../domain/center_management.dart' show centerPlaceLabel;

/// Espera depois do último toque antes de salvar a chamada.
const Duration kCallAutosaveDelay = Duration(milliseconds: 1200);

/// P3–P7 · Chamada da aula do centro: P/J/F por aluno (salva sozinha),
/// encaixe de reposição, finalizar com o resumo dos créditos e, depois de
/// finalizada, correção com justificativa e o histórico do registro.
/// P9: o vínculo caiu no meio — o aviso entra no lugar da chamada.
class CenterCoachCallPage extends ConsumerStatefulWidget {
  const CenterCoachCallPage({
    super.key,
    required this.centerId,
    required this.sessionId,
  });

  final String centerId;
  final String sessionId;

  @override
  ConsumerState<CenterCoachCallPage> createState() =>
      _CenterCoachCallPageState();
}

enum _SaveState { idle, saving, saved, failed }

class _CenterCoachCallPageState extends ConsumerState<CenterCoachCallPage> {
  /// Marcas tocadas aqui (por cima do que está no servidor); `null` = apagar.
  final Map<String, CenterMark?> _edits = {};

  /// Encaixados de reposição (cópia local, carregada da aula uma vez).
  List<String>? _makeupIds;
  final Map<String, String> _makeupNames = {};
  Timer? _debounce;
  _SaveState _save = _SaveState.idle;
  bool _finalizing = false;
  bool _revoked = false;

  ({String centerId, String sessionId}) get _key =>
      (centerId: widget.centerId, sessionId: widget.sessionId);

  @override
  void dispose() {
    _debounce?.cancel();
    super.dispose();
  }

  Map<String, CenterMark> _marks(CenterCoachSession s) {
    final out = {...s.attendance};
    for (final e in _edits.entries) {
      if (e.value == null) {
        out.remove(e.key);
      } else {
        out[e.key] = e.value!;
      }
    }
    return out;
  }

  String _actorName(CenterMembership? m) =>
      (m?.displayName.isNotEmpty ?? false) ? m!.displayName : 'Professor';

  void _scheduleSave() {
    _debounce?.cancel();
    setState(() => _save = _SaveState.saving);
    _debounce = Timer(kCallAutosaveDelay, () => _flush());
  }

  Future<bool> _flush({bool finalize = false}) async {
    _debounce?.cancel();
    final session = ref.read(coachSessionProvider(_key)).valueOrNull;
    if (session == null) return false;
    final member = ref.read(centerMembershipProvider(widget.centerId));
    final sent = Map.of(_edits);
    setState(() => _save = _SaveState.saving);
    try {
      await ref
          .read(centerCoachRepositoryProvider)
          .saveAttendance(
            centerId: widget.centerId,
            session: session,
            marks: _marks(session),
            makeupIds: _makeupIds ?? session.makeupStudentIds,
            finalize: finalize,
            actorUid: ref.read(professorLinksUidProvider),
            actorName: _actorName(member),
            audit: finalize,
          );
      if (!mounted) return true;
      setState(() {
        // Só sai o que foi enviado — o toque feito durante o salvamento fica.
        for (final e in sent.entries) {
          if (_edits.containsKey(e.key) && _edits[e.key] == e.value) {
            _edits.remove(e.key);
          }
        }
        _save = _debounce?.isActive ?? false
            ? _SaveState.saving
            : _SaveState.saved;
      });
      return true;
    } on CenterCoachException catch (e) {
      if (!mounted) return false;
      setState(() {
        _save = _SaveState.failed;
        _revoked = e.revoked;
      });
      if (!e.revoked) _toast(e.message);
      return false;
    }
  }

  void _toast(String text) {
    ScaffoldMessenger.maybeOf(context)
      ?..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(text)));
  }

  void _setMark(String studentId, CenterMark m) {
    setState(() => _edits[studentId] = m);
    _scheduleSave();
  }

  void _markAllUnmarked(List<RollCallRow> rows, CenterMark m) {
    setState(() {
      for (final r in rows) {
        if (r.mark == null) _edits[r.studentId] = m;
      }
    });
    _scheduleSave();
  }

  void _removeMakeup(String studentId) {
    setState(() {
      _makeupIds = [
        for (final id in _makeupIds ?? const <String>[])
          if (id != studentId) id,
      ];
      _edits[studentId] = null;
    });
    _scheduleSave();
  }

  Future<void> _addMakeup(
    CenterCoachSession session,
    List<RollCallRow> rows,
  ) async {
    final picked = await showProfessorLinksSheet<MakeupCandidate>(
      context,
      builder: (_) => _MakeupSheet(
        centerId: widget.centerId,
        sessionId: widget.sessionId,
        exclude: {for (final r in rows) r.studentId},
        free: _freeSeats(session),
      ),
    );
    if (picked == null || !mounted) return;
    setState(() {
      _makeupIds = [...?_makeupIds, picked.id];
      _makeupNames[picked.id] = picked.name;
    });
    await _flush();
  }

  int? _freeSeats(CenterCoachSession s) {
    final cls = _classOf(s);
    if (cls == null || cls.capacity <= 0) return null;
    return cls.capacity -
        cls.rosterStudentIds.length -
        (_makeupIds?.length ?? 0);
  }

  CenterCoachClass? _classOf(CenterCoachSession s) {
    for (final c
        in ref.read(coachClassesProvider(widget.centerId)).valueOrNull ??
            const <CenterCoachClass>[]) {
      if (c.id == s.classId) return c;
    }
    return null;
  }

  Future<void> _finish(
    CenterCoachSession session,
    List<RollCallRow> rows,
    CenterCoachPolicies policies,
  ) async {
    final counts = rollCallCounts(rows);
    if (counts.unmarked > 0) {
      _toast(
        'Marque todos os alunos antes de finalizar '
        '(${counts.unmarked} sem marcação).',
      );
      return;
    }
    final ok = await showProfessorLinksSheet<bool>(
      context,
      builder: (sheet) => _FinishSheet(
        session: session,
        rows: rows,
        policies: policies,
        onConfirm: () => Navigator.of(sheet).pop(true),
        onBack: () => Navigator.of(sheet).pop(false),
      ),
    );
    if (ok != true || !mounted) return;
    setState(() => _finalizing = true);
    final saved = await _flush(finalize: true);
    if (!mounted) return;
    setState(() => _finalizing = false);
    if (saved)
      _toast('Aula finalizada. Os créditos saem pela regra do centro.');
  }

  Future<void> _openRecord(CenterCoachSession session, RollCallRow row) async {
    await showProfessorLinksSheet<void>(
      context,
      builder: (sheet) => _RecordSheet(
        session: session,
        row: row,
        onCorrect: () {
          Navigator.of(sheet).pop();
          _correct(session, row);
        },
      ),
    );
  }

  /// G5 · Ações da gestão sobre esta aula: mudar o local (L6) ou cancelar
  /// (G6). Horário, professor e quadra seguem no portal.
  Future<void> _actions(
    CenterCoachSession session,
    CenterCoachCenter? center,
  ) async {
    final picked = await showProfessorLinksSheet<String>(
      context,
      builder: (sheet) => ProfessorLinksSheetBody(
        key: const Key('center-coach-actions-sheet'),
        title: session.className,
        subtitle: 'Só esta data · ${session.startTime}',
        children: [
          ProfessorLinksSheetRow(
            key: const Key('center-coach-action-location'),
            icon: Icons.place_outlined,
            title: 'Mudar local',
            subtitle: centerPlaceLabel(
              session.locationName,
              session.courtName,
            ),
            onTap: () => Navigator.of(sheet).pop('location'),
          ),
          ProfessorLinksSheetRow(
            key: const Key('center-coach-cancel'),
            icon: Icons.event_busy_outlined,
            title: 'Cancelar aula',
            subtitle: 'Avisa os alunos e gera reposição',
            danger: true,
            onTap: () => Navigator.of(sheet).pop('cancel'),
          ),
        ],
      ),
    );
    if (!mounted) return;
    if (picked == 'cancel') return _cancel(session, center);
    if (picked == 'location') {
      final enrollments =
          ref.read(coachEnrollmentsProvider(widget.centerId)).valueOrNull ??
          const [];
      final ok = await showCenterLocationSheet(
        context,
        centerId: widget.centerId,
        session: session,
        affected: cancelAffectedStudents(session, enrollments).length,
      );
      if (ok == true && mounted) _toast('Local desta aula alterado.');
    }
  }

  /// G6 · Cancelar esta aula (gestão).
  Future<void> _cancel(
    CenterCoachSession session,
    CenterCoachCenter? center,
  ) async {
    final enrollments =
        ref.read(coachEnrollmentsProvider(widget.centerId)).valueOrNull ??
        const [];
    final affected = cancelAffectedStudents(session, enrollments);
    final auto = center?.policies.cancelledClassMakeupAuto ?? true;
    final reason = await showProfessorLinksSheet<String>(
      context,
      builder: (_) => _CancelSheet(
        session: session,
        affected: affected.length,
        autoMakeup: auto,
        makeupDays: center?.policies.makeupValidityDays ?? 30,
      ),
    );
    if (reason == null || !mounted) return;
    final member = ref.read(centerMembershipProvider(widget.centerId));
    try {
      await ref
          .read(centerCoachRepositoryProvider)
          .cancelSession(
            centerId: widget.centerId,
            session: session,
            reason: reason,
            creditStudentIds: auto ? affected : const [],
            actorUid: ref.read(professorLinksUidProvider),
            actorName: _actorName(member),
          );
      if (mounted) {
        _toast(
          affected.isEmpty
              ? 'Aula cancelada.'
              : 'Aula cancelada. ${affected.length} '
                    '${affected.length == 1 ? 'aluno avisado' : 'alunos avisados'}.',
        );
      }
    } on CenterCoachException catch (e) {
      if (!mounted) return;
      if (e.revoked) {
        setState(() => _revoked = true);
      } else {
        _toast(e.message);
      }
    }
  }

  Future<void> _correct(CenterCoachSession session, RollCallRow row) async {
    final member = ref.read(centerMembershipProvider(widget.centerId));
    final result = await showProfessorLinksSheet<(CenterMark, String)>(
      context,
      builder: (_) =>
          _CorrectSheet(row: row, finalizedBy: session.finalizedByName),
    );
    if (result == null || !mounted) return;
    try {
      await ref
          .read(centerCoachRepositoryProvider)
          .correctAttendance(
            centerId: widget.centerId,
            session: session,
            studentId: row.studentId,
            studentName: row.name,
            to: result.$1,
            reason: result.$2,
            actorUid: ref.read(professorLinksUidProvider),
            actorName: _actorName(member),
          );
      if (mounted) _toast('Correção salva e registrada no histórico.');
    } on CenterCoachException catch (e) {
      if (!mounted) return;
      if (e.revoked) {
        setState(() => _revoked = true);
      } else {
        _toast(e.message);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final sessionAsync = ref.watch(coachSessionProvider(_key));
    final session = sessionAsync.valueOrNull;
    final member = ref.watch(centerMembershipProvider(widget.centerId));
    final memberships = ref.watch(myCenterMembershipsProvider);
    final center = ref.watch(coachCenterProvider(widget.centerId)).valueOrNull;
    final uid = ref.watch(professorLinksUidProvider);
    final today = nexagoEventDayKey(ref.watch(professorLinksClockProvider)());
    final students =
        ref.watch(coachStudentsProvider(widget.centerId)).valueOrNull ??
        const {};
    ref.watch(coachClassesProvider(widget.centerId));
    if (session != null && _makeupIds == null) {
      _makeupIds = [...session.makeupStudentIds];
    }
    final revoked =
        _revoked ||
        (memberships.hasValue && (member == null || !member.isActive));

    final subtitle = session == null
        ? null
        : [
            session.className,
            session.startTime,
            if (session.courtName.isNotEmpty) session.courtName,
          ].join(' · ').toUpperCase();

    final canCancel =
        !revoked &&
        session != null &&
        session.status == 'scheduled' &&
        // Como no portal: aula passada não se cancela (fecha a chamada).
        session.date.compareTo(today) >= 0 &&
        (member?.isManager ?? false) &&
        !(center?.isSuspended ?? false);
    if (member?.isManager ?? false)
      ref.watch(coachEnrollmentsProvider(widget.centerId));
    return ProfessorLinksScaffold(
      title: session?.isDone ?? false ? 'Chamada · finalizada' : 'Chamada',
      subtitle: subtitle,
      trailing: canCancel
          ? ProfessorLinksRoundButton(
              key: const Key('center-coach-session-actions'),
              icon: Icons.more_horiz_rounded,
              semanticLabel: 'Alterar ou cancelar a aula',
              onTap: () => _actions(session, center),
            )
          : null,
      onBack: () async {
        if (_debounce?.isActive ?? false) await _flush();
        if (context.mounted) popOrGo(context, AppRoutes.centerCoachAgenda);
      },
      body: Builder(
        builder: (context) {
          if (revoked) {
            return ListView(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
              children: [
                CenterCoachRevokedCard(
                  key: const Key('center-coach-call-revoked'),
                  centerName: member?.centerName ?? center?.name ?? 'centro',
                  onOther: () => popOrGo(context, AppRoutes.centerCoachAgenda),
                ),
                if (_edits.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  const ProfessorLinksNote(
                    'A presença que estava sendo marcada não foi salva.',
                    tone: ProfessorLinksNoteTone.red,
                  ),
                ],
              ],
            );
          }
          if (session == null) {
            return sessionAsync.isLoading
                ? const Center(
                    child: CircularProgressIndicator(color: AppColors.brand),
                  )
                : const Padding(
                    padding: EdgeInsets.all(20),
                    child: ProfessorLinksCard(
                      key: Key('center-coach-call-missing'),
                      child: ProfessorMutedText(
                        'Esta aula não está mais na agenda do centro.',
                      ),
                    ),
                  );
          }
          final canCall = coachCanTakeAttendance(
            member: member,
            center: center,
            session: session,
            uid: uid,
            todayKey: today,
          );
          final editable = canCall && !session.isDone;
          final rows = buildRollCall(
            session: session,
            cls: _classOf(session),
            marks: _marks(session),
            makeupIds: _makeupIds ?? session.makeupStudentIds,
            students: students,
            extraNames: _makeupNames,
          );
          final counts = rollCallCounts(rows);
          return Column(
            children: [
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
                  children: [
                    if (!canCall) ...[
                      ProfessorLinksNote(
                        key: const Key('center-coach-call-readonly'),
                        _readOnlyReason(session, member, center, uid, today),
                        tone: ProfessorLinksNoteTone.blue,
                      ),
                      const SizedBox(height: 12),
                    ],
                    if (member != null &&
                        (member.isManager ||
                            member.role == 'receptionist')) ...[
                      _ClassInfoCard(
                        key: const Key('center-coach-class-info'),
                        session: session,
                        cls: _classOf(session),
                      ),
                      const SizedBox(height: 12),
                    ],
                    Row(
                      children: [
                        for (final (v, l, c) in [
                          (counts.present, 'presentes', AppColors.win),
                          (counts.excused, 'justificadas', AppColors.pending),
                          (counts.absent, 'faltas', AppColors.live),
                          (
                            counts.unmarked,
                            'sem registro',
                            ProfessorLinksStyle.dim(colors),
                          ),
                        ]) ...[
                          Expanded(
                            child: _CountTile(value: v, label: l, color: c),
                          ),
                          if (l != 'sem registro') const SizedBox(width: 6),
                        ],
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text(
                      session.isDone
                          ? 'Finalizada${session.finalizedByName.isEmpty ? '' : ' por ${session.finalizedByName}'} · toque no aluno para ver o histórico ou corrigir'
                          : 'P presente · J falta justificada · F falta não justificada',
                      style: AppTypography.bodyS.copyWith(
                        fontSize: 11.5,
                        color: ProfessorLinksStyle.dim(colors),
                      ),
                    ),
                    if (editable && counts.unmarked > 1) ...[
                      const SizedBox(height: 10),
                      Align(
                        alignment: Alignment.centerLeft,
                        child: TextButton.icon(
                          key: const Key('center-coach-mark-all'),
                          onPressed: () =>
                              _markAllUnmarked(rows, CenterMark.present),
                          icon: const Icon(Icons.done_all_rounded, size: 16),
                          label: Text(
                            'Marcar ${counts.unmarked} sem registro como presentes',
                          ),
                        ),
                      ),
                    ],
                    const SizedBox(height: 10),
                    if (rows.isEmpty)
                      const ProfessorLinksCard(
                        child: ProfessorMutedText(
                          'Nenhum aluno nesta turma ainda.',
                        ),
                      ),
                    for (final r in rows) ...[
                      _StudentRow(
                        key: Key('center-coach-student-${r.studentId}'),
                        row: r,
                        editable: editable,
                        onMark: (m) => _setMark(r.studentId, m),
                        onRemoveMakeup: r.makeup && editable
                            ? () => _removeMakeup(r.studentId)
                            : null,
                        onTap: session.isDone
                            ? () => _openRecord(session, r)
                            : null,
                        canCorrect: session.isDone && canCall,
                      ),
                      const SizedBox(height: 8),
                    ],
                    if (session.trials.isNotEmpty) ...[
                      const SizedBox(height: 6),
                      Text(
                        'AULA EXPERIMENTAL',
                        key: const Key('center-coach-trials'),
                        style: ProfessorLinksStyle.mono(
                          10,
                          color: ProfessorLinksStyle.dim(colors),
                        ),
                      ),
                      const SizedBox(height: 8),
                      for (final t in session.trials) ...[
                        _TrialRow(
                          key: Key('center-coach-trial-${t.athleteId}'),
                          trial: t,
                          // C8: depois que a aula começa, o professor (ou a
                          // recepção) avalia a experimental confirmada.
                          onTap:
                              !t.isPending &&
                                  t.bookingId.isNotEmpty &&
                                  session.date.compareTo(today) <= 0 &&
                                  centerCanEvaluateTrial(
                                    member: member,
                                    session: session,
                                    uid: uid,
                                  )
                              ? () => context.pushNamed(
                                  AppRouteNames.centerCoachTrialReview,
                                  pathParameters: {
                                    'centerId': widget.centerId,
                                    'sessionId': session.id,
                                    'trialKey': t.key,
                                  },
                                )
                              : null,
                        ),
                        const SizedBox(height: 8),
                      ],
                    ],
                    if (editable)
                      _DashedButton(
                        key: const Key('center-coach-add-makeup'),
                        label: 'Encaixar aluno com reposição',
                        onTap: () => _addMakeup(session, rows),
                      ),
                  ],
                ),
              ),
              if (editable)
                _CallFooter(
                  counts: counts,
                  state: _save,
                  finalizing: _finalizing,
                  onFinish: () => _finish(
                    session,
                    rows,
                    center?.policies ?? const CenterCoachPolicies(),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}

String _readOnlyReason(
  CenterCoachSession s,
  CenterMembership? m,
  CenterCoachCenter? c,
  String uid,
  String today,
) {
  if (c?.isSuspended ?? false) {
    return 'Centro suspenso: a chamada fica só para consulta.';
  }
  if (s.isCancelled) {
    return 'Aula cancelada pelo centro${s.changeReason.isEmpty ? '' : ': ${s.changeReason}'}.';
  }
  if (s.date.compareTo(today) > 0) {
    return 'A chamada abre no dia da aula (${trainingWeekdayDay(s.date)}).';
  }
  if (s.coachUid != uid) {
    return 'Esta aula é do ${s.coachName.isEmpty ? 'outro professor' : 'Prof. ${s.coachName}'} — a chamada é dele.';
  }
  return 'Seu papel neste centro não faz chamada.';
}

/// G5 · Para a gestão e a recepção: quem dá a aula e como está a ocupação.
class _ClassInfoCard extends StatelessWidget {
  const _ClassInfoCard({super.key, required this.session, required this.cls});

  final CenterCoachSession session;
  final CenterCoachClass? cls;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final o = centerSessionOccupancy(cls, session);
    final coach = session.coachName.isNotEmpty
        ? session.coachName
        : (cls?.coachName ?? '');
    Widget stat(String v, String l, Color? c, String k) => Expanded(
      child: Container(
        key: Key('center-coach-class-$k'),
        padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
        decoration: BoxDecoration(
          color: colors.surfaceRaised,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: ProfessorLinksStyle.line(colors)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              v,
              style: ProfessorLinksStyle.display(
                17,
                color: c == null ? colors.onSurface : colors.readableTone(c),
              ),
            ),
            Text(
              l,
              style: AppTypography.bodyS.copyWith(
                fontSize: 10.5,
                color: ProfessorLinksStyle.dim(colors),
              ),
            ),
          ],
        ),
      ),
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ProfessorLinksCard(
          padding: const EdgeInsets.all(12),
          child: Row(
            children: [
              ArenaClassAvatar(
                initials: arenaClassInitials(coach.isEmpty ? '?' : coach),
                size: 40,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      coach.isEmpty ? 'Sem professor definido' : coach,
                      style: ProfessorLinksStyle.display(
                        14,
                        weight: FontWeight.w700,
                        color: colors.onSurface,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      [
                        'Professor',
                        if (session.placeLabel.isNotEmpty) session.placeLabel,
                      ].join(' · '),
                      style: AppTypography.bodyS.copyWith(
                        fontSize: 11.5,
                        color: ProfessorLinksStyle.dim(colors),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            stat(
              o.capacity > 0 ? '${o.enrolled}/${o.capacity}' : '${o.enrolled}',
              'matriculados',
              null,
              'enrolled',
            ),
            const SizedBox(width: 8),
            stat(
              o.makeups > 0 ? '+${o.makeups}' : '0',
              o.makeups == 1 ? 'reposição' : 'reposições',
              o.makeups > 0 ? AppColors.win : null,
              'makeups',
            ),
            if (o.trials > 0) ...[
              const SizedBox(width: 8),
              stat(
                '+${o.trials}',
                o.trials == 1 ? 'experimental' : 'experimentais',
                AppColors.pending,
                'trials',
              ),
            ],
            const SizedBox(width: 8),
            stat(
              o.free == null ? '—' : '${o.free}',
              o.free == 1 ? 'vaga livre' : 'vagas livres',
              (o.free ?? 0) > 0 ? AppColors.brand : null,
              'free',
            ),
          ],
        ),
      ],
    );
  }
}

class _CountTile extends StatelessWidget {
  const _CountTile({
    required this.value,
    required this.label,
    required this.color,
  });

  final int value;
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: const EdgeInsets.fromLTRB(9, 9, 8, 9),
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        borderRadius: BorderRadius.circular(13),
        border: Border.all(color: ProfessorLinksStyle.line(colors)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '$value',
            style: ProfessorLinksStyle.display(
              17,
              color: colors.readableTone(color),
            ),
          ),
          Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: AppTypography.bodyS.copyWith(
              fontSize: 10.5,
              color: ProfessorLinksStyle.dim(colors),
            ),
          ),
        ],
      ),
    );
  }
}

class _StudentRow extends StatelessWidget {
  const _StudentRow({
    super.key,
    required this.row,
    required this.editable,
    required this.onMark,
    required this.canCorrect,
    this.onRemoveMakeup,
    this.onTap,
  });

  final RollCallRow row;
  final bool editable;
  final bool canCorrect;
  final ValueChanged<CenterMark> onMark;
  final VoidCallback? onRemoveMakeup;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final r = row;
    final rsvp = rsvpLabel(r);
    final effect = effectLabel(r.effect);
    final sub = [
      if (r.makeup) 'Reposição',
      if (r.former) 'Saiu da turma',
      ?rsvp,
      if (effect.isNotEmpty) effect,
    ].join(' · ');
    return ProfessorLinksCard(
      onTap: onTap,
      borderColor: editable && r.mark == null
          ? AppColors.brand.withValues(alpha: 0.35)
          : null,
      padding: const EdgeInsets.all(12),
      child: Row(
        children: [
          ArenaClassAvatar(
            initials: arenaClassInitials(r.name),
            size: 36,
            color: r.makeup ? AppColors.win : AppColors.brand,
          ),
          const SizedBox(width: 11),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Flexible(
                      child: Text(
                        r.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: ProfessorLinksStyle.display(
                          13.5,
                          weight: FontWeight.w700,
                          color: colors.onSurface,
                        ),
                      ),
                    ),
                    if (r.hold) ...[
                      const SizedBox(width: 6),
                      const ArenaClassTag(
                        label: 'Pendência',
                        color: AppColors.live,
                      ),
                    ],
                  ],
                ),
                if (sub.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(
                    sub,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.bodyS.copyWith(
                      fontSize: 11,
                      color: r.rsvp == 'not_going'
                          ? colors.readableTone(AppColors.pending)
                          : ProfessorLinksStyle.dim(colors),
                    ),
                  ),
                ],
                if (onRemoveMakeup != null)
                  GestureDetector(
                    key: Key('center-coach-remove-${r.studentId}'),
                    onTap: onRemoveMakeup,
                    child: Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Text(
                        'Tirar da aula',
                        style: AppTypography.bodyS.copyWith(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: colors.readableTone(AppColors.live),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          CenterMarkButtons(
            studentId: r.studentId,
            mark: r.mark,
            onChanged: editable ? onMark : null,
          ),
        ],
      ),
    );
  }
}

class _DashedButton extends StatelessWidget {
  const _DashedButton({super.key, required this.label, required this.onTap});

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        height: 46,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: ProfessorLinksStyle.line2(colors)),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.add_rounded,
              size: 16,
              color: ProfessorLinksStyle.mute(colors),
            ),
            const SizedBox(width: 8),
            Flexible(
              child: Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppTypography.bodyS.copyWith(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: ProfessorLinksStyle.mute(colors),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CallFooter extends StatelessWidget {
  const _CallFooter({
    required this.counts,
    required this.state,
    required this.finalizing,
    required this.onFinish,
  });

  final RollCallCounts counts;
  final _SaveState state;
  final bool finalizing;
  final VoidCallback onFinish;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final status = switch (state) {
      _SaveState.saving => 'SALVANDO…',
      _SaveState.failed =>
        'NÃO SALVOU · TOQUE EM FINALIZAR PARA TENTAR DE NOVO',
      _ => 'SALVO AUTOMATICAMENTE',
    };
    return Container(
      padding: EdgeInsets.fromLTRB(
        20,
        12,
        20,
        12 + MediaQuery.paddingOf(context).bottom,
      ),
      decoration: BoxDecoration(
        color: colors.canvas,
        border: Border(
          top: BorderSide(color: ProfessorLinksStyle.line(colors)),
        ),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            '${counts.total - counts.unmarked}/${counts.total} REGISTRADOS · $status',
            key: const Key('center-coach-save-state'),
            textAlign: TextAlign.center,
            style: ProfessorLinksStyle.mono(
              10,
              color: state == _SaveState.failed
                  ? colors.readableTone(AppColors.live)
                  : ProfessorLinksStyle.dim(colors),
            ),
          ),
          const SizedBox(height: 8),
          ProfessorLinksPrimaryButton(
            key: const Key('center-coach-finish'),
            label: 'Finalizar aula',
            loading: finalizing,
            onPressed: finalizing ? null : onFinish,
          ),
        ],
      ),
    );
  }
}

/// P5 · Finalizar: resumo e o que acontece com os créditos.
class _FinishSheet extends StatelessWidget {
  const _FinishSheet({
    required this.session,
    required this.rows,
    required this.policies,
    required this.onConfirm,
    required this.onBack,
  });

  final CenterCoachSession session;
  final List<RollCallRow> rows;
  final CenterCoachPolicies policies;
  final VoidCallback onConfirm;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final c = rollCallCounts(rows);
    // Agrupa os alunos com a mesma consequência ("Marina, Lucas · Aula usada").
    final groups = <String, List<RollCallRow>>{};
    for (final r in rows) {
      groups.putIfAbsent(finalizeConsequence(r, policies), () => []).add(r);
    }
    final holds = [
      for (final r in rows)
        if (r.hold) r.name,
    ];
    return ProfessorLinksSheetBody(
      key: const Key('center-coach-finish-sheet'),
      title: 'Finalizar aula',
      subtitle: '${session.className} · ${session.startTime}',
      children: [
        ProfessorLinksCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.baseline,
                textBaseline: TextBaseline.alphabetic,
                children: [
                  Text(
                    '${c.present}/${c.total}',
                    style: ProfessorLinksStyle.display(
                      30,
                      color: colors.onSurface,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    'presentes',
                    style: AppTypography.bodyS.copyWith(
                      fontSize: 12.5,
                      color: ProfessorLinksStyle.dim(colors),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: Row(
                  children: [
                    for (final (n, col) in [
                      (c.present, AppColors.win),
                      (c.excused, AppColors.pending),
                      (c.absent, AppColors.live),
                    ])
                      if (n > 0)
                        Expanded(
                          flex: n,
                          child: Container(height: 8, color: col),
                        ),
                  ],
                ),
              ),
            ],
          ),
        ),
        Text(
          'O QUE ACONTECE COM OS CRÉDITOS',
          style: ProfessorLinksStyle.mono(
            9.5,
            color: ProfessorLinksStyle.dim(colors),
          ),
        ),
        ProfessorLinksCard(
          padding: EdgeInsets.zero,
          child: Column(
            children: [
              for (final (i, e) in groups.entries.indexed)
                Container(
                  padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
                  decoration: BoxDecoration(
                    border: i == 0
                        ? null
                        : Border(
                            top: BorderSide(
                              color: ProfessorLinksStyle.line(colors),
                            ),
                          ),
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              e.value
                                  .map((r) => r.name.split(' ').first)
                                  .join(', '),
                              style: ProfessorLinksStyle.display(
                                13,
                                weight: FontWeight.w600,
                                color: colors.onSurface,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              e.key,
                              style: AppTypography.bodyS.copyWith(
                                fontSize: 11,
                                color: ProfessorLinksStyle.dim(colors),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
            ],
          ),
        ),
        if (holds.isNotEmpty)
          ProfessorLinksNote(
            '${holds.join(', ')} ${holds.length == 1 ? 'está' : 'estão'} com '
            'mensalidade em atraso. A recepção resolve — você não vê valores.',
            tone: ProfessorLinksNoteTone.yellow,
          ),
        Text(
          'Depois de finalizar, mudanças na chamada só com justificativa e '
          'ficam registradas.',
          style: AppTypography.bodyS.copyWith(
            fontSize: 11.5,
            height: 1.45,
            color: ProfessorLinksStyle.dim(colors),
          ),
        ),
        ProfessorLinksPrimaryButton(
          key: const Key('center-coach-finish-confirm'),
          label: 'Confirmar e finalizar',
          onPressed: onConfirm,
        ),
        ProfessorLinksGhostButton(
          label: 'Voltar à chamada',
          height: 44,
          onPressed: onBack,
        ),
      ],
    );
  }
}

/// P7 · Histórico do registro de um aluno nesta aula.
class _RecordSheet extends StatelessWidget {
  const _RecordSheet({
    required this.session,
    required this.row,
    required this.onCorrect,
  });

  final CenterCoachSession session;
  final RollCallRow row;
  final VoidCallback onCorrect;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final entries = [
      for (final c in session.attendanceLog)
        if (c.studentId == row.studentId) c,
    ]..sort((a, b) => (b.at ?? DateTime(0)).compareTo(a.at ?? DateTime(0)));
    final effect = effectLabel(row.effect);
    return ProfessorLinksSheetBody(
      key: const Key('center-coach-record-sheet'),
      title: row.name,
      subtitle: 'PRESENÇA · ${trainingWeekdayDay(session.date)}',
      children: [
        ProfessorLinksCard(
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      centerMarkLabel(row.mark),
                      style: ProfessorLinksStyle.display(
                        15,
                        weight: FontWeight.w700,
                        color: colors.onSurface,
                      ),
                    ),
                    if (entries.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(
                        'Corrigido · antes: ${centerMarkLabel(entries.last.from).toLowerCase()}',
                        style: AppTypography.bodyS.copyWith(
                          fontSize: 11.5,
                          color: ProfessorLinksStyle.dim(colors),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              if (entries.isNotEmpty)
                const ArenaClassTag(label: 'Corrigido', color: AppColors.win),
            ],
          ),
        ),
        Text(
          'HISTÓRICO DO REGISTRO',
          style: ProfessorLinksStyle.mono(
            9.5,
            color: ProfessorLinksStyle.dim(colors),
          ),
        ),
        ProfessorLinksCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              for (final c in entries) ...[
                _TimelineItem(
                  title:
                      'De ${centerMarkLabel(c.from).toLowerCase()} para ${centerMarkLabel(c.to).toLowerCase()}',
                  meta: [
                    if (c.at != null) _stamp(c.at!),
                    if (c.byName.isNotEmpty) c.byName,
                  ].join(' · '),
                  reason: c.reason,
                ),
                const SizedBox(height: 12),
              ],
              _TimelineItem(
                title:
                    'Aula finalizada · ${centerMarkLabel(entries.isEmpty ? row.mark : entries.last.from)}',
                meta: [
                  if (session.finalizedAt != null) _stamp(session.finalizedAt!),
                  if (session.finalizedByName.isNotEmpty)
                    session.finalizedByName,
                ].join(' · '),
              ),
              if (effect.isNotEmpty) ...[
                const SizedBox(height: 12),
                _TimelineItem(title: 'Créditos: $effect', meta: 'Sistema'),
              ],
            ],
          ),
        ),
        ProfessorLinksPrimaryButton(
          key: const Key('center-coach-record-correct'),
          label: 'Corrigir presença',
          onPressed: onCorrect,
        ),
      ],
    );
  }
}

String _stamp(DateTime at) {
  final l = toNexagoEventLocal(at);
  const months = [
    'jan', 'fev', 'mar', 'abr', 'mai', 'jun', //
    'jul', 'ago', 'set', 'out', 'nov', 'dez',
  ];
  return '${l.day} ${months[l.month - 1]} '
      '${l.hour.toString().padLeft(2, '0')}:${l.minute.toString().padLeft(2, '0')}';
}

class _TimelineItem extends StatelessWidget {
  const _TimelineItem({
    required this.title,
    required this.meta,
    this.reason = '',
  });

  final String title;
  final String meta;
  final String reason;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 9,
          height: 9,
          margin: const EdgeInsets.only(top: 4, right: 10),
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: colors.surfaceRaised,
            border: Border.all(color: ProfessorLinksStyle.line2(colors)),
          ),
        ),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: ProfessorLinksStyle.display(
                  13,
                  weight: FontWeight.w600,
                  color: colors.onSurface,
                ),
              ),
              if (meta.isNotEmpty)
                Text(
                  meta,
                  style: ProfessorLinksStyle.mono(
                    9.5,
                    color: ProfessorLinksStyle.dim(colors),
                  ),
                ),
              if (reason.isNotEmpty) ...[
                const SizedBox(height: 4),
                Text(
                  '“$reason”',
                  style: AppTypography.bodyS.copyWith(
                    fontSize: 12,
                    fontStyle: FontStyle.italic,
                    height: 1.4,
                    color: ProfessorLinksStyle.mute(colors),
                  ),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

/// P6 · Corrigir presença (justificativa obrigatória).
class _CorrectSheet extends StatefulWidget {
  const _CorrectSheet({required this.row, required this.finalizedBy});

  final RollCallRow row;
  final String finalizedBy;

  @override
  State<_CorrectSheet> createState() => _CorrectSheetState();
}

class _CorrectSheetState extends State<_CorrectSheet> {
  late CenterMark _to = widget.row.mark == CenterMark.present
      ? CenterMark.excused
      : CenterMark.present;
  final _reason = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return ProfessorLinksSheetBody(
      key: const Key('center-coach-correct-sheet'),
      title: 'Corrigir presença · ${widget.row.name}',
      subtitle:
          'Registrado como ${centerMarkLabel(widget.row.mark).toLowerCase()}'
          '${widget.finalizedBy.isEmpty ? '' : ' · finalizada por ${widget.finalizedBy}'}',
      children: [
        Text(
          'NOVO REGISTRO',
          style: ProfessorLinksStyle.mono(
            9.5,
            color: ProfessorLinksStyle.dim(colors),
          ),
        ),
        Row(
          children: [
            for (final m in CenterMark.values) ...[
              if (m != CenterMark.present) const SizedBox(width: 8),
              Expanded(
                child: Material(
                  color: _to == m
                      ? centerMarkColor(m).withValues(alpha: 0.14)
                      : colors.surfaceRaised,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                    side: BorderSide(
                      color: _to == m
                          ? centerMarkColor(m).withValues(alpha: 0.55)
                          : ProfessorLinksStyle.line(colors),
                    ),
                  ),
                  clipBehavior: Clip.antiAlias,
                  child: InkWell(
                    key: Key('center-coach-correct-${centerMarkValue(m)}'),
                    onTap: () => setState(() => _to = m),
                    child: SizedBox(
                      height: 42,
                      child: Center(
                        child: Text(
                          centerMarkLabel(m) == 'Falta justificada'
                              ? 'Justificada'
                              : centerMarkLabel(m),
                          style: AppTypography.bodyS.copyWith(
                            fontSize: 12.5,
                            fontWeight: FontWeight.w600,
                            color: _to == m
                                ? colors.readableTone(centerMarkColor(m))
                                : ProfessorLinksStyle.mute(colors),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ],
        ),
        Text(
          'JUSTIFICATIVA (OBRIGATÓRIA)',
          style: ProfessorLinksStyle.mono(
            9.5,
            color: ProfessorLinksStyle.dim(colors),
          ),
        ),
        TextField(
          key: const Key('center-coach-correct-reason'),
          controller: _reason,
          minLines: 2,
          maxLines: 4,
          maxLength: 280,
          textCapitalization: TextCapitalization.sentences,
          style: AppTypography.bodyS.copyWith(color: colors.onSurface),
          decoration: InputDecoration(
            hintText:
                'Ex.: chegou atrasado pela quadra 3, marquei falta antes de ver.',
            counterText: '',
            filled: true,
            fillColor: ProfessorLinksStyle.soft(colors),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(13),
              borderSide: BorderSide(color: ProfessorLinksStyle.line2(colors)),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(13),
              borderSide: BorderSide(color: ProfessorLinksStyle.line2(colors)),
            ),
          ),
        ),
        const ProfessorLinksNote(
          'O servidor refaz os créditos desta aula pela nova marcação e o '
          'histórico guarda as duas entradas.',
        ),
        if (_error != null)
          ProfessorLinksNote(_error!, tone: ProfessorLinksNoteTone.red),
        ProfessorLinksPrimaryButton(
          key: const Key('center-coach-correct-save'),
          label: 'Salvar correção',
          onPressed: () {
            final err = correctionError(widget.row.mark, _to, _reason.text);
            if (err != null) {
              setState(() => _error = err);
              return;
            }
            Navigator.of(context).pop((_to, _reason.text.trim()));
          },
        ),
      ],
    );
  }
}

/// P4 · Encaixar aluno com crédito de reposição.
class _MakeupSheet extends ConsumerStatefulWidget {
  const _MakeupSheet({
    required this.centerId,
    required this.sessionId,
    required this.exclude,
    required this.free,
  });

  final String centerId;
  final String sessionId;
  final Set<String> exclude;
  final int? free;

  @override
  ConsumerState<_MakeupSheet> createState() => _MakeupSheetState();
}

class _MakeupSheetState extends ConsumerState<_MakeupSheet> {
  late final Future<List<MakeupCandidate>> _future = ref
      .read(centerCoachRepositoryProvider)
      .makeupCandidates(widget.centerId, widget.sessionId);
  String _query = '';
  MakeupCandidate? _picked;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return ProfessorLinksSheetBody(
      key: const Key('center-coach-makeup-sheet'),
      title: 'Encaixar reposição',
      subtitle: widget.free == null
          ? 'Alunos com crédito de reposição'
          : widget.free! <= 0
          ? 'Turma cheia — encaixe só se couber na quadra'
          : '${widget.free} ${widget.free == 1 ? 'vaga livre' : 'vagas livres'}',
      children: [
        TextField(
          key: const Key('center-coach-makeup-search'),
          onChanged: (v) => setState(() => _query = v.trim().toLowerCase()),
          style: AppTypography.bodyS.copyWith(color: colors.onSurface),
          decoration: InputDecoration(
            hintText: 'Buscar aluno',
            prefixIcon: const Icon(Icons.search_rounded, size: 18),
            filled: true,
            fillColor: ProfessorLinksStyle.soft(colors),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(13),
              borderSide: BorderSide(color: ProfessorLinksStyle.line2(colors)),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(13),
              borderSide: BorderSide(color: ProfessorLinksStyle.line2(colors)),
            ),
          ),
        ),
        FutureBuilder<List<MakeupCandidate>>(
          future: _future,
          builder: (context, snap) {
            if (snap.hasError) {
              return ProfessorLinksNote(
                snap.error is CenterCoachException
                    ? (snap.error as CenterCoachException).message
                    : 'Não foi possível buscar os alunos.',
                tone: ProfessorLinksNoteTone.red,
              );
            }
            if (!snap.hasData) {
              return const Padding(
                padding: EdgeInsets.symmetric(vertical: 20),
                child: Center(
                  child: CircularProgressIndicator(color: AppColors.brand),
                ),
              );
            }
            final list = [
              for (final c in snap.data!)
                if (!widget.exclude.contains(c.id) &&
                    (_query.isEmpty || c.name.toLowerCase().contains(_query)))
                  c,
            ];
            if (list.isEmpty) {
              return const ProfessorMutedText(
                'Nenhum aluno com crédito de reposição disponível.',
              );
            }
            return Column(
              children: [
                for (final c in list) ...[
                  ProfessorLinksCard(
                    key: Key('center-coach-makeup-${c.id}'),
                    onTap: () => setState(() => _picked = c),
                    borderColor: _picked?.id == c.id
                        ? AppColors.win.withValues(alpha: 0.5)
                        : null,
                    padding: const EdgeInsets.all(12),
                    child: Row(
                      children: [
                        ArenaClassAvatar(
                          initials: arenaClassInitials(c.name),
                          size: 34,
                          color: AppColors.win,
                        ),
                        const SizedBox(width: 11),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                c.name,
                                style: ProfessorLinksStyle.display(
                                  13.5,
                                  weight: FontWeight.w700,
                                  color: colors.onSurface,
                                ),
                              ),
                              Text(
                                c.makeupCredits == 1
                                    ? '1 reposição'
                                    : '${c.makeupCredits} reposições',
                                style: AppTypography.bodyS.copyWith(
                                  fontSize: 11,
                                  color: ProfessorLinksStyle.dim(colors),
                                ),
                              ),
                            ],
                          ),
                        ),
                        Icon(
                          _picked?.id == c.id
                              ? Icons.check_circle_rounded
                              : Icons.radio_button_unchecked_rounded,
                          size: 22,
                          color: _picked?.id == c.id
                              ? AppColors.win
                              : ProfessorLinksStyle.line2(colors),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 8),
                ],
              ],
            );
          },
        ),
        Text(
          'O crédito é consumido só quando a presença for registrada e a aula '
          'finalizada.',
          style: AppTypography.bodyS.copyWith(
            fontSize: 11.5,
            color: ProfessorLinksStyle.dim(colors),
          ),
        ),
        ProfessorLinksPrimaryButton(
          key: const Key('center-coach-makeup-confirm'),
          label: _picked == null
              ? 'Escolha um aluno'
              : 'Encaixar ${_picked!.name.split(' ').first}',
          onPressed: _picked == null
              ? null
              : () => Navigator.of(context).pop(_picked),
        ),
      ],
    );
  }
}

/// G6 · Cancelar aula: motivo (aparece para os alunos) e o que acontece.
class _CancelSheet extends StatefulWidget {
  const _CancelSheet({
    required this.session,
    required this.affected,
    required this.autoMakeup,
    required this.makeupDays,
  });

  final CenterCoachSession session;
  final int affected;
  final bool autoMakeup;
  final int makeupDays;

  @override
  State<_CancelSheet> createState() => _CancelSheetState();
}

class _CancelSheetState extends State<_CancelSheet> {
  String _reason = kCancelReasons.first;
  final _other = TextEditingController();
  bool _useOther = false;

  @override
  void dispose() {
    _other.dispose();
    super.dispose();
  }

  String get _final => _useOther ? _other.text.trim() : _reason;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final s = widget.session;
    final n = widget.affected;
    return ProfessorLinksSheetBody(
      key: const Key('center-coach-cancel-sheet'),
      title: 'Cancelar aula',
      subtitle:
          '${trainingWeekdayDay(s.date)} · ${s.startTime} · '
          '$n ${n == 1 ? 'aluno' : 'alunos'}',
      children: [
        Text(
          'MOTIVO · APARECE PARA OS ALUNOS',
          style: ProfessorLinksStyle.mono(
            9.5,
            color: ProfessorLinksStyle.dim(colors),
          ),
        ),
        Wrap(
          spacing: 6,
          runSpacing: 6,
          children: [
            for (final r in kCancelReasons)
              AvailabilityChoiceChip(
                key: Key('center-coach-cancel-reason-$r'),
                label: r,
                selected: !_useOther && _reason == r,
                onTap: () => setState(() {
                  _reason = r;
                  _useOther = false;
                }),
              ),
            AvailabilityChoiceChip(
              key: const Key('center-coach-cancel-reason-other'),
              label: 'Outro',
              selected: _useOther,
              onTap: () => setState(() => _useOther = true),
            ),
          ],
        ),
        if (_useOther)
          TextField(
            key: const Key('center-coach-cancel-other'),
            controller: _other,
            maxLength: 120,
            onChanged: (_) => setState(() {}),
            textCapitalization: TextCapitalization.sentences,
            style: AppTypography.bodyS.copyWith(color: colors.onSurface),
            decoration: InputDecoration(
              hintText: 'Escreva o motivo',
              counterText: '',
              filled: true,
              fillColor: ProfessorLinksStyle.soft(colors),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(13),
                borderSide: BorderSide(
                  color: ProfessorLinksStyle.line2(colors),
                ),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(13),
                borderSide: BorderSide(
                  color: ProfessorLinksStyle.line2(colors),
                ),
              ),
            ),
          ),
        ProfessorLinksCard(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
          child: Column(
            children: [
              for (final (k, v) in [
                ('Créditos', 'nenhum consumido'),
                (
                  'Reposições',
                  widget.autoMakeup
                      ? '+$n · validade ${widget.makeupDays} dias'
                      : 'o centro concede manualmente',
                ),
                ('Outras datas', 'não mudam'),
                ('Aviso', 'push aos alunos agora'),
              ])
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          k,
                          style: AppTypography.bodyS.copyWith(
                            fontSize: 12,
                            color: ProfessorLinksStyle.dim(colors),
                          ),
                        ),
                      ),
                      Text(
                        v,
                        style: ProfessorLinksStyle.display(
                          12.5,
                          weight: FontWeight.w600,
                          color: colors.onSurface,
                        ),
                      ),
                    ],
                  ),
                ),
            ],
          ),
        ),
        Text(
          'Para cancelar esta e as próximas, edite a turma no portal do centro.',
          style: AppTypography.bodyS.copyWith(
            fontSize: 11.5,
            color: ProfessorLinksStyle.dim(colors),
          ),
        ),
        ProfessorLinksGhostButton(
          key: const Key('center-coach-cancel-confirm'),
          color: AppColors.live,
          label: n == 0
              ? 'Cancelar aula'
              : 'Cancelar e avisar $n ${n == 1 ? 'aluno' : 'alunos'}',
          onPressed: _final.length < 3
              ? null
              : () => Navigator.of(context).pop(_final),
        ),
      ],
    );
  }
}

/// Atleta da experimental: ainda não é aluno, então não entra na chamada —
/// o professor vê quem vem e se o centro já confirmou.
class _TrialRow extends StatelessWidget {
  const _TrialRow({super.key, required this.trial, this.onTap});

  final CenterSessionTrial trial;

  /// Abre a avaliação (C8); `null` = só leitura.
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final t = trial;
    final tone = t.evaluated
        ? (t.attendance == 'no_show' ? colors.live : colors.win)
        : t.isPending
        ? colors.pending
        : colors.win;
    final (line, label) = t.evaluated
        ? (
            'Experimental · avaliação enviada',
            t.attendance == 'no_show' ? 'NÃO VEIO' : 'AVALIADA',
          )
        : t.isPending
        ? ('Experimental · o centro ainda vai confirmar', 'AGUARDANDO')
        : onTap != null
        ? ('Experimental · avaliar', 'CONFIRMADA')
        : ('Experimental · confirmada pelo centro', 'CONFIRMADA');
    return ProfessorLinksCard(
      onTap: onTap,
      padding: const EdgeInsets.all(12),
      borderColor: tone.withValues(alpha: 0.35),
      child: Row(
        children: [
          ArenaClassAvatar(
            initials: arenaClassInitials(t.name),
            photoUrl: t.photoUrl,
            size: 40,
            zoomName: t.name,
            zoomRole: 'Aula experimental',
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  t.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: ProfessorLinksStyle.display(
                    14,
                    weight: FontWeight.w700,
                    color: colors.onSurface,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  line,
                  style: AppTypography.bodyS.copyWith(
                    fontSize: 11.5,
                    color: ProfessorLinksStyle.dim(colors),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Text(
            label,
            style: ProfessorLinksStyle.mono(
              10,
              color: colors.readableTone(tone),
            ),
          ),
          if (onTap != null) ...[
            const SizedBox(width: 4),
            Icon(
              Icons.chevron_right_rounded,
              size: 16,
              color: ProfessorLinksStyle.dim(colors),
            ),
          ],
        ],
      ),
    );
  }
}
