import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/links/open_external_url.dart';
import '../../../core/router/navigation_helpers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../professor_links/application/professor_links_providers.dart';
import '../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../professor_mode/presentation/widgets/professor_students_widgets.dart';
import '../application/athlete_training_providers.dart';
import '../domain/athlete_training.dart';
import 'widgets/training_origin_widgets.dart';
import 'widgets/training_widgets.dart';

/// O7 · Aula do centro — onde é (o local DA DATA, com aviso quando muda só
/// nesta aula), como chegar, quem dá a aula e a regra de falta do centro.
/// Destino do push `training_center_session_notice` / `class_reminder`.
class AthleteTrainingCenterSessionPage extends ConsumerWidget {
  const AthleteTrainingCenterSessionPage({
    super.key,
    required this.centerId,
    required this.sessionId,
  });

  final String centerId;
  final String sessionId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final async = ref.watch(athleteTrainingCenterProvider(centerId));
    final center = async.valueOrNull;
    final session = center?.sessionById(sessionId);
    final now = ref.watch(professorLinksClockProvider)();
    final training = center == null || session == null
        ? null
        : trainingFromCenterSession(center, session, now);

    return ProfessorLinksScaffold(
      title: 'Aula do centro',
      subtitle: training == null
          ? null
          : '${trainingWeekdayDay(training.dateKey)} · ${training.startTime}'
                '${session!.durationMin > 0 ? ' – ${_end(training.startTime, session.durationMin)}' : ''}',
      onBack: () => popOrGo(
        context,
        AppRoutes.athleteTrainingCenter.replaceFirst(':centerId', centerId),
      ),
      body: RefreshIndicator(
        color: AppColors.brand,
        onRefresh: () async {
          ref.invalidate(athleteTrainingCentersProvider);
          await ref.read(athleteTrainingCentersProvider.future);
        },
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
          children: [
            if (async.isLoading && center == null)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 40),
                child: Center(
                  child: CircularProgressIndicator(color: AppColors.brand),
                ),
              )
            else if (center == null || session == null || training == null)
              const ProfessorLinksCard(
                key: Key('training-center-session-missing'),
                child: ProfessorMutedText(
                  'Esta aula não está mais na sua agenda do centro.',
                ),
              )
            else ...[
              if (session.isCancelled)
                const TrainingOriginNote(
                  key: Key('training-center-session-cancelled'),
                  color: AppColors.live,
                  icon: Icons.event_busy_outlined,
                  title: 'Aula cancelada pelo centro',
                  text:
                      'Quando o centro cancela, a reposição segue a regra '
                      'dele — confira seus créditos na tela do centro.',
                )
              else if (session.locationChanged)
                TrainingOriginNote(
                  key: const Key('training-center-session-moved'),
                  color: AppColors.pending,
                  icon: Icons.place_outlined,
                  title: 'Local mudou só nesta aula',
                  text: [
                    if (session.defaultLocationName.isNotEmpty)
                      'De ${session.defaultLocationName} para '
                          '${session.locationName}.',
                    if (session.changeReason.isNotEmpty)
                      _sentence(session.changeReason),
                    'As próximas voltam para o local de sempre.',
                  ].join(' '),
                )
              else if (session.changed && session.changeReason.isNotEmpty)
                TrainingOriginNote(
                  color: AppColors.pending,
                  icon: Icons.info_outline_rounded,
                  title: 'Aula alterada nesta data',
                  text: session.changeReason,
                ),
              const SizedBox(height: 12),
              ProfessorLinksCard(
                padding: const EdgeInsets.all(14),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            session.locationName.isEmpty
                                ? 'Local a confirmar'
                                : session.locationName,
                            style: ProfessorLinksStyle.display(
                              15,
                              weight: FontWeight.w700,
                              color: colors.onSurface,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            [
                              session.locationAddress,
                              if (session.courtName.isNotEmpty)
                                session.courtName,
                            ].where((s) => s.isNotEmpty).join(' · '),
                            style: AppTypography.bodyS.copyWith(
                              fontSize: 12,
                              color: ProfessorLinksStyle.dim(colors),
                            ),
                          ),
                        ],
                      ),
                    ),
                    if (session.locationName.isNotEmpty ||
                        session.locationAddress.isNotEmpty) ...[
                      const SizedBox(width: 10),
                      SizedBox(
                        width: 124,
                        child: ProfessorLinksGhostButton(
                          key: const Key('training-center-session-maps'),
                          label: 'Como chegar',
                          height: 38,
                          onPressed: () => openExternalUrl(
                            'https://www.google.com/maps/search/?api=1&query='
                            '${Uri.encodeComponent([session.locationName, session.locationAddress].where((s) => s.isNotEmpty).join(', '))}',
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(height: 12),
              TrainingKeyValueCard(
                key: const Key('training-center-session-info'),
                rows: [
                  ('Turma', session.className, null),
                  if (session.coachName.isNotEmpty)
                    ('Professor', session.coachName, null),
                  ('Centro', center.name, trainingCenterColor),
                  if (session.isMakeup)
                    ('Tipo', 'Reposição', ProfessorLinksStyle.blue),
                  (
                    'Situação',
                    trainingStateLabel(training),
                    trainingStateColor(training, colors),
                  ),
                  if (!session.isCancelled &&
                      training.endAt.isAfter(now) &&
                      center.policies.excusedAbsenceMakeup)
                    (
                      'Não vai?',
                      'Avise o centro até '
                          '${center.policies.excusedNoticeHours}h antes para '
                          'ganhar reposição',
                      null,
                    ),
                ],
              ),
              const SizedBox(height: 12),
              ProfessorLinksGhostButton(
                key: const Key('training-center-session-open-center'),
                label: 'Ver ${center.name}',
                onPressed: () => context.pushNamed(
                  AppRouteNames.athleteTrainingCenter,
                  pathParameters: {'centerId': centerId},
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// "07:00" + 90 min → "08:30".
String _end(String start, int minutes) {
  final p = start.split(':');
  if (p.length < 2) return '';
  final h = int.tryParse(p[0]), m = int.tryParse(p[1]);
  if (h == null || m == null) return '';
  final total = (h * 60 + m + minutes) % (24 * 60);
  return '${(total ~/ 60).toString().padLeft(2, '0')}:'
      '${(total % 60).toString().padLeft(2, '0')}';
}

/// Fecha a frase com ponto quando o centro não pôs pontuação.
String _sentence(String text) {
  final t = text.trim();
  return RegExp(r'[.!?]$').hasMatch(t) ? t : '$t.';
}
