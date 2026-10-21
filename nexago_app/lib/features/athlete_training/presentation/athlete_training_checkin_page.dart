import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/location/location_permission_status.dart';
import '../../../core/location/user_location_providers.dart';
import '../../../core/router/navigation_helpers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../professor_links/application/professor_links_providers.dart';
import '../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../professor_mode/application/professor_lesson_plans_providers.dart';
import '../../professor_mode/domain/professor_lesson_plans.dart';
import '../../professor_mode/presentation/lesson_plans/athlete_lesson_plan_pages.dart'
    show openAthleteLessonPlan;
import '../application/athlete_training_providers.dart';
import '../domain/athlete_training.dart';
import '../domain/class_presence.dart';
import '../infrastructure/class_presence_repository.dart';
import 'widgets/training_widgets.dart';

/// T5 · Check-in na arena pela localização do aparelho (até 100 m da arena,
/// de 60 min antes até o fim da aula). Grava "presente" na chamada — o
/// professor vê na hora.
///
/// QR da quadra fica para depois: o app não tem leitor de QR e a arena não
/// tem QR impresso por quadra. Sem localização, o professor marca na chamada.
class AthleteTrainingCheckInPage extends ConsumerStatefulWidget {
  const AthleteTrainingCheckInPage({super.key, required this.sessionId});

  final String sessionId;

  @override
  ConsumerState<AthleteTrainingCheckInPage> createState() =>
      _AthleteTrainingCheckInPageState();
}

enum _Problem { permission, settings, noPosition }

class _AthleteTrainingCheckInPageState
    extends ConsumerState<AthleteTrainingCheckInPage> {
  bool _busy = false;
  DateTime? _doneAt;
  String? _error;
  _Problem? _problem;

  Future<void> _checkIn(TrainingSession t) async {
    setState(() {
      _busy = true;
      _error = null;
      _problem = null;
    });
    final location = ref.read(userLocationServiceProvider);
    try {
      final status = await location.ensurePermission();
      if (status != LocationPermissionStatus.granted) {
        setState(() {
          _problem = status == LocationPermissionStatus.denied
              ? _Problem.permission
              : _Problem.settings;
          _error = status == LocationPermissionStatus.serviceDisabled
              ? 'A localização do aparelho está desligada.'
              : 'Precisamos da sua localização para confirmar que você '
                  'está na arena.';
        });
        return;
      }
      final position = await location.tryCurrentPosition();
      final lat = position?.latitude;
      final lng = position?.longitude;
      if (lat == null || lng == null) {
        setState(() {
          _problem = _Problem.noPosition;
          _error = 'Não conseguimos sua localização agora. Tente de novo.';
        });
        return;
      }
      await ref
          .read(classPresenceRepositoryProvider)
          .checkIn(sessionId: t.id, lat: lat, lng: lng);
      refreshAthleteClassPresence(ref);
      setState(() => _doneAt = ref.read(professorLinksClockProvider)());
    } on ClassPresenceException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final now = ref.watch(professorLinksClockProvider)();
    final trainings = ref.watch(athleteTrainingsProvider);
    TrainingSession? t;
    for (final x in trainings ?? const <TrainingSession>[]) {
      if (!x.isPrivate && x.id == widget.sessionId) t = x;
    }
    final views =
        ref.watch(athleteLessonPlanViewsProvider).valueOrNull ?? const [];
    final plan = t == null ? null : lessonPlanViewFor(views, t.planKind, t.id);
    final done = _doneAt != null || (t != null && trainingCheckedIn(t));

    final subtitle = t == null
        ? 'CHECK-IN'
        : [trainingWeekdayDay(t.dateKey), t.title.toUpperCase(), t.startTime]
            .where((s) => s.isNotEmpty)
            .join(' · ');

    return ProfessorLinksScaffold(
      title: 'Check-in',
      subtitle: subtitle,
      onBack: () => popOrGo(context, AppRoutes.athleteTrainings),
      body: trainings == null
          ? const Center(
              child: CircularProgressIndicator(color: AppColors.brand),
            )
          : t == null
              ? const Padding(
                  padding: EdgeInsets.fromLTRB(20, 8, 20, 40),
                  child: ProfessorLinksNote(
                    'Esta aula não está mais na sua agenda.',
                    tone: ProfessorLinksNoteTone.yellow,
                  ),
                )
              : _body(context, t, now, done, plan),
    );
  }

  Widget _body(
    BuildContext context,
    TrainingSession t,
    DateTime now,
    bool done,
    LessonPlanView? plan,
  ) {
    final open = trainingCanCheckIn(t, now);
    final focus = plan?.myFocus;
    return Column(
      children: [
        Expanded(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
            children: [
              _Hero(training: t, now: now, done: done, doneAt: _doneAt),
              if (focus != null) ...[
                const SizedBox(height: 12),
                TrainingFocusNote(focus: focus, label: 'SEU FOCO HOJE'),
              ],
              if (!done && !open) ...[
                const SizedBox(height: 12),
                ProfessorLinksNote(
                  now.isBefore(t.startAt)
                      ? 'O check-in abre ${kCheckInOpensBefore.inMinutes} min '
                          'antes da aula.'
                      : 'O check-in desta aula já fechou.',
                  tone: ProfessorLinksNoteTone.yellow,
                ),
              ],
              if (_error != null) ...[
                const SizedBox(height: 12),
                ProfessorLinksNote(
                  _error!,
                  key: const Key('training-checkin-error'),
                  tone: ProfessorLinksNoteTone.red,
                ),
                if (_problem == _Problem.settings) ...[
                  const SizedBox(height: 8),
                  ProfessorLinksGhostButton(
                    key: const Key('training-checkin-settings'),
                    label: 'Abrir ajustes',
                    height: 42,
                    onPressed: () => ref
                        .read(userLocationServiceProvider)
                        .openSettings(app: true),
                  ),
                ],
              ],
              if (!done) ...[
                const SizedBox(height: 12),
                const _NoSignal(),
              ],
            ],
          ),
        ),
        SafeArea(
          top: false,
          minimum: const EdgeInsets.fromLTRB(20, 8, 20, 16),
          child: done
              ? (plan != null && plan.planVisible
                  ? ProfessorLinksGhostButton(
                      key: const Key('training-checkin-plan'),
                      label: 'Ver plano da aula',
                      onPressed: () => openAthleteLessonPlan(context, plan.id),
                    )
                  : ProfessorLinksGhostButton(
                      key: const Key('training-checkin-back'),
                      label: 'Voltar aos treinos',
                      onPressed: () =>
                          popOrGo(context, AppRoutes.athleteTrainings),
                    ))
              : ProfessorLinksPrimaryButton(
                  key: const Key('training-checkin-submit'),
                  label: 'Fazer check-in',
                  height: 56,
                  loading: _busy,
                  onPressed: open ? () => _checkIn(t) : null,
                ),
        ),
      ],
    );
  }
}

class _Hero extends StatelessWidget {
  const _Hero({
    required this.training,
    required this.now,
    required this.done,
    required this.doneAt,
  });

  final TrainingSession training;
  final DateTime now;
  final bool done;
  final DateTime? doneAt;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final t = training;
    final tone = done ? colors.win : AppColors.brand;
    final minutes = trainingMinutesToStart(t, now);
    final court = t.courtName.isEmpty ? '' : ' na ${t.courtName}';
    final professor = trainingFirstName(t.professorName);
    final title = done
        ? 'Presença registrada'
        : t.arenaName.isEmpty
            ? 'Check-in na arena'
            : 'Check-in na ${t.arenaName}';
    final sub = done
        ? [
            if (doneAt != null) 'Check-in às ${wallClockLabel(doneAt!)}',
            professor.isEmpty
                ? 'o professor já vê você na chamada'
                : 'o $professor já vê você na chamada',
          ].join(' · ')
        : minutes > 0
            ? 'Aula começa em $minutes min$court'
            : minutes == 0
                ? 'Aula começa agora$court'
                : 'Aula começou há ${-minutes} min$court';
    return Container(
      key: Key(done ? 'training-checkin-done' : 'training-checkin-hero'),
      padding: const EdgeInsets.fromLTRB(18, 26, 18, 22),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(24),
        color: colors.surfaceCard,
        gradient: RadialGradient(
          center: Alignment.topCenter,
          radius: 1.1,
          colors: [
            tone.withValues(alpha: done ? 0.18 : 0.16),
            colors.surfaceCard.withValues(alpha: 0),
          ],
        ),
        border: Border.all(color: tone.withValues(alpha: 0.32)),
      ),
      child: Column(
        children: [
          Container(
            width: 64,
            height: 64,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color:
                  done ? colors.win : AppColors.brand.withValues(alpha: 0.14),
              border: done
                  ? null
                  : Border.all(color: AppColors.brand.withValues(alpha: 0.4)),
            ),
            child: Icon(
              done ? Icons.check_rounded : Icons.location_on_outlined,
              size: 28,
              color: done ? ProfessorLinksStyle.onBrand : AppColors.brand,
            ),
          ),
          const SizedBox(height: 14),
          Text(
            title,
            textAlign: TextAlign.center,
            style: ProfessorLinksStyle.display(22, color: colors.onSurface),
          ),
          const SizedBox(height: 8),
          Text(
            sub,
            textAlign: TextAlign.center,
            style: AppTypography.bodyS.copyWith(
              fontSize: 13,
              height: 1.45,
              color: ProfessorLinksStyle.mute(colors),
            ),
          ),
          if (!done) ...[
            const SizedBox(height: 8),
            Text(
              'USAMOS SUA LOCALIZAÇÃO · ATÉ 100 M DA ARENA',
              textAlign: TextAlign.center,
              style: ProfessorLinksStyle.mono(
                10,
                color: ProfessorLinksStyle.dim(colors),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// Sem localização: o professor marca na chamada (QR da quadra ainda não
/// existe).
class _NoSignal extends StatelessWidget {
  const _NoSignal();

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: const EdgeInsets.fromLTRB(13, 12, 13, 12),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        color: colors.surfaceCard,
        border: Border.all(color: ProfessorLinksStyle.line2(colors)),
      ),
      child: Row(
        children: [
          Icon(
            Icons.how_to_reg_outlined,
            size: 20,
            color: ProfessorLinksStyle.mute(colors),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Sem sinal de localização?',
                  style: ProfessorLinksStyle.display(
                    12.5,
                    weight: FontWeight.w600,
                    color: colors.onSurface,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  'Avise o professor: ele marca sua presença na chamada.',
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
    );
  }
}
