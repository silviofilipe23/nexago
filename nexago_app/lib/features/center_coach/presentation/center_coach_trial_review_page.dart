import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/router/navigation_helpers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../arena/domain/aulas/arena_class_logic.dart';
import '../../arena/presentation/aulas/widgets/arena_class_atoms.dart';
import '../../professor_links/application/professor_links_providers.dart';
import '../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../professor_mode/presentation/availability/availability_widgets.dart'
    show AvailabilityChoiceChip;
import '../../professor_mode/presentation/widgets/professor_students_widgets.dart';
import '../application/center_coach_providers.dart';
import '../domain/center_coach.dart';
import '../domain/center_coach_repository.dart' show CenterCoachException;
import '../domain/center_leads.dart';
import '../infrastructure/firebase_center_leads_repository.dart';
import 'widgets/center_coach_widgets.dart' show coachClassScheduleLabel;
import 'widgets/center_management_widgets.dart';

/// Tamanho máximo da observação para a recepção.
const int kTrialNoteMaxLength = 500;

/// Quem avalia a experimental: o professor da aula ou a equipe que matricula.
bool centerCanEvaluateTrial({
  required CenterMembership? member,
  required CenterCoachSession session,
  required String uid,
}) =>
    member != null &&
    member.isActive &&
    (session.coachUid == uid || member.has('enroll_students'));

/// C8 · Avaliar a aula experimental (professor): veio ou não, o nível
/// observado, a turma indicada e uma observação para a recepção montar a
/// proposta. O atleta não vê.
class CenterCoachTrialReviewPage extends ConsumerStatefulWidget {
  const CenterCoachTrialReviewPage({
    super.key,
    required this.centerId,
    required this.sessionId,
    required this.trialKey,
  });

  final String centerId;
  final String sessionId;
  final String trialKey;

  @override
  ConsumerState<CenterCoachTrialReviewPage> createState() =>
      _CenterCoachTrialReviewPageState();
}

class _CenterCoachTrialReviewPageState
    extends ConsumerState<CenterCoachTrialReviewPage> {
  final _note = TextEditingController();
  bool? _attended;
  String _level = '';
  String _classId = '';
  bool _seeded = false;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  void _back() => popOrGo(
        context,
        AppRoutes.centerCoachSession
            .replaceFirst(':centerId', widget.centerId)
            .replaceFirst(':sessionId', widget.sessionId),
      );

  Future<void> _send(CenterSessionTrial trial) async {
    if (_busy || _attended == null) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(centerLeadsRepositoryProvider).evaluateTrial(
            centerId: widget.centerId,
            bookingId: trial.bookingId,
            attended: _attended!,
            level: _attended! ? _level : null,
            classId: _attended! ? _classId : null,
            note: _note.text,
          );
      if (!mounted) return;
      ScaffoldMessenger.maybeOf(context)?.showSnackBar(
        const SnackBar(content: Text('Avaliação enviada para a recepção.')),
      );
      _back();
    } on CenterCoachException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final centerId = widget.centerId;
    final sessionAsync = ref.watch(
      coachSessionProvider((centerId: centerId, sessionId: widget.sessionId)),
    );
    final session = sessionAsync.valueOrNull;
    final member = ref.watch(centerMembershipProvider(centerId));
    final uid = ref.watch(professorLinksUidProvider);
    final today = centerLeadDayKey(ref.watch(professorLinksClockProvider)());
    final classes =
        ref.watch(coachClassesProvider(centerId)).valueOrNull ?? const [];
    final trial =
        session?.trials.where((t) => t.key == widget.trialKey).firstOrNull;

    if (trial != null && !_seeded) {
      _seeded = true;
      if (trial.attendance == 'attended') _attended = true;
      if (trial.attendance == 'no_show') _attended = false;
    }

    String? subtitle;
    if (session != null) {
      final day = session.date == today
          ? 'HOJE'
          : session.date == centerLeadShiftDay(today, -1)
              ? 'ONTEM'
              : centerLeadWeekdayDay(session.date).toUpperCase();
      subtitle = '${session.className.toUpperCase()} · $day '
          '${session.startTime}';
    }

    Widget message(String text, {Key? key}) => Padding(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
          child: ProfessorLinksCard(
            key: key,
            child: ProfessorMutedText(text),
          ),
        );

    final Widget body;
    if (session == null) {
      body = sessionAsync.isLoading
          ? const Center(
              child: CircularProgressIndicator(color: AppColors.brand),
            )
          : message(
              'Esta aula não está mais na agenda do centro.',
              key: const Key('center-trial-review-missing'),
            );
    } else if (!centerCanEvaluateTrial(
      member: member,
      session: session,
      uid: uid,
    )) {
      body = message(
        'Só o professor da aula ou a recepção avaliam a experimental.',
        key: const Key('center-trial-review-denied'),
      );
    } else if (trial == null || trial.bookingId.isEmpty) {
      body = message(
        'Esta aula experimental não está mais na aula.',
        key: const Key('center-trial-review-gone'),
      );
    } else {
      final cls = classes.where((c) => c.id == session.classId).firstOrNull;
      final suggested = centerTrialSuggestedClasses(
        classes: classes,
        programId: cls?.programId ?? '',
      );
      final profile = centerTrialProfileLine(trial);
      final canSend = _attended != null &&
          (_attended == false || _level.isNotEmpty) &&
          !_busy;
      body = ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
        children: [
          ProfessorLinksCard(
            child: Row(
              children: [
                ArenaClassAvatar(
                  initials: arenaClassInitials(trial.name),
                  photoUrl: trial.photoUrl,
                  size: 44,
                  color: const Color(0xFF9AA0A6),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        trial.name,
                        style: ProfessorLinksStyle.display(
                          16,
                          weight: FontWeight.w700,
                          color: colors.onSurface,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        profile.isEmpty ? 'Aula experimental' : profile,
                        style: AppTypography.bodyS.copyWith(
                          fontSize: 11.5,
                          color: ProfessorLinksStyle.dim(colors),
                        ),
                      ),
                    ],
                  ),
                ),
                if (_attended != null)
                  ArenaClassTag(
                    label: _attended! ? 'Veio' : 'Não veio',
                    color: _attended! ? AppColors.win : AppColors.live,
                  ),
              ],
            ),
          ),
          if (trial.evaluated) ...[
            const SizedBox(height: 12),
            const ProfessorLinksNote(
              'Avaliação já enviada. Se enviar de novo, a recepção recebe a '
              'versão nova.',
              key: Key('center-trial-review-evaluated'),
              tone: ProfessorLinksNoteTone.blue,
            ),
          ],
          const SizedBox(height: 16),
          const CenterKicker('Presença'),
          const SizedBox(height: 8),
          CenterSegmented<String>(
            options: const [('yes', 'Veio'), ('no', 'Não veio')],
            value: _attended == null ? '' : (_attended! ? 'yes' : 'no'),
            onChanged: (v) => setState(() => _attended = v == 'yes'),
          ),
          if (_attended == null) ...[
            const SizedBox(height: 6),
            Text(
              'Toque em "Veio" ou "Não veio".',
              style: AppTypography.bodyS.copyWith(
                fontSize: 11,
                color: ProfessorLinksStyle.dim(colors),
              ),
            ),
          ],
          if (_attended == true) ...[
            const SizedBox(height: 16),
            const CenterKicker('Nível que você observou'),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final e in kCenterLeadLevelLabels.entries)
                  AvailabilityChoiceChip(
                    key: Key('center-trial-review-level-${e.key}'),
                    label: e.value,
                    selected: _level == e.key,
                    onTap: () => setState(() => _level = e.key),
                  ),
              ],
            ),
            const SizedBox(height: 16),
            const CenterKicker('Turma indicada'),
            const SizedBox(height: 8),
            if (suggested.isEmpty)
              const ProfessorMutedText('Nenhuma turma ativa no centro.'),
            for (final c in suggested) ...[
              CenterRadioTile(
                key: Key('center-trial-review-class-${c.id}'),
                title: c.name,
                subtitle: [
                  coachClassScheduleLabel(c),
                  centerClassSpotsLabel(c) ?? '',
                ].where((s) => s.isNotEmpty).join(' · '),
                selected: _classId == c.id,
                onTap: () => setState(
                  () => _classId = _classId == c.id ? '' : c.id,
                ),
              ),
              const SizedBox(height: 8),
            ],
          ],
          const SizedBox(height: 16),
          const CenterKicker('Observação para a recepção'),
          const SizedBox(height: 8),
          _NoteField(controller: _note),
          const SizedBox(height: 10),
          Text(
            '${trial.name.split(' ').first} não vê esta avaliação. Ela vai '
            'para a recepção montar a proposta.',
            style: AppTypography.bodyS.copyWith(
              fontSize: 11.5,
              height: 1.45,
              color: ProfessorLinksStyle.dim(colors),
            ),
          ),
          const SizedBox(height: 16),
          if (_error != null) ...[
            ProfessorLinksNote(_error!, tone: ProfessorLinksNoteTone.red),
            const SizedBox(height: 10),
          ],
          ProfessorLinksPrimaryButton(
            key: const Key('center-trial-review-send'),
            label: trial.evaluated ? 'Reenviar avaliação' : 'Enviar avaliação',
            loading: _busy,
            onPressed: canSend ? () => _send(trial) : null,
          ),
        ],
      );
    }

    return ProfessorLinksScaffold(
      title: 'Aula experimental',
      subtitle: subtitle,
      onBack: _back,
      body: body,
    );
  }
}

class _NoteField extends StatelessWidget {
  const _NoteField({required this.controller});

  final TextEditingController controller;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final border = OutlineInputBorder(
      borderRadius: BorderRadius.circular(14),
      borderSide: BorderSide(color: ProfessorLinksStyle.line2(colors)),
    );
    return TextField(
      key: const Key('center-trial-review-note'),
      controller: controller,
      minLines: 3,
      maxLines: 6,
      maxLength: kTrialNoteMaxLength,
      maxLengthEnforcement: MaxLengthEnforcement.enforced,
      style: AppTypography.bodyS.copyWith(color: colors.onSurface, height: 1.5),
      decoration: InputDecoration(
        hintText: 'Pontos fortes, o que precisa trabalhar, como se encaixou…',
        filled: true,
        fillColor: ProfessorLinksStyle.soft(colors),
        border: border,
        enabledBorder: border,
      ),
    );
  }
}
