import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/formatting/app_currency_format.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../professor_links/application/professor_links_providers.dart';
import '../../../professor_links/domain/arena_professor_link.dart';
import '../../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../application/professor_wallet_providers.dart';
import '../../domain/professor_actions_logic.dart' show professorDayLabel;
import '../../domain/professor_lessons.dart';
import '../../domain/professor_wallet.dart';
import '../actions/professor_action_widgets.dart' show ProfessorActionHint;
import '../widgets/professor_students_widgets.dart';
import 'professor_wallet_widgets.dart';

/// Quantas aulas passadas o B4 mostra.
const int kProfessorPastLessonsShown = 5;

/// "Nova aula" (B9): escolhe a arena (vínculo independente ativo com
/// "Reservar quadras"; com uma só, vai direto), guarda o aluno para a
/// confirmação da reserva e abre a página da arena — o horário sai do fluxo
/// de reserva de sempre, como professor.
Future<void> startProfessorLesson(
  BuildContext context,
  WidgetRef ref, {
  required String athleteId,
  required List<ArenaProfessorLink> arenas,
}) async {
  if (arenas.isEmpty) return;
  final arenaId = arenas.length == 1
      ? arenas.first.arenaId
      : await showProfessorLinksSheet<String>(
          context,
          builder: (sheetContext) => ProfessorLinksSheetBody(
            title: 'Em qual arena?',
            subtitle: 'Você reserva a quadra como professor',
            children: [
              for (final l in arenas) ...[
                const SizedBox(height: 8),
                ProfessorLinksCard(
                  key: Key('professor-lesson-arena-${l.arenaId}'),
                  onTap: () => Navigator.of(sheetContext).pop(l.arenaId),
                  child: Row(
                    children: [
                      ProfessorArenaMark(
                        name: l.arenaName,
                        logoUrl: l.arenaLogoUrl,
                        size: 36,
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          l.arenaName,
                          style: ProfessorLinksStyle.display(
                            14,
                            weight: FontWeight.w600,
                            color: sheetContext.themeColors.onSurface,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ],
          ),
        );
  if (arenaId == null || !context.mounted) return;
  ref.read(professorLessonStudentProvider.notifier).state = athleteId;
  context.push(AppRoutes.arenaDetail.replaceAll(':arenaId', arenaId));
}

/// Seção "Aulas" do aluno da carteira (B4): próximas e últimas, com a
/// situação da reserva (cancelada riscada), e o botão "Nova aula".
class ProfessorWalletLessonsSection extends ConsumerWidget {
  const ProfessorWalletLessonsSection({
    super.key,
    required this.student,
    required this.lessons,
  });

  final ProfessorWalletStudent student;

  /// `null` = carregando.
  final ProfessorStudentLessons? lessons;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final todayKey = ref.watch(professorWalletTodayKeyProvider);
    final status = professorBookingStatusById(
      ref.watch(professorCourtBookingsProvider).valueOrNull ?? const [],
    );
    final links = ref.watch(myProfessorLinksProvider).valueOrNull;
    final arenas = links == null ? null : professorLessonArenas(links);
    final l = lessons;
    final past = l?.past.take(kProfessorPastLessonsShown).toList();

    Widget row(ProfessorLesson lesson) => _LessonRow(
          key: Key('professor-wallet-lesson-${lesson.bookingId}'),
          lesson: lesson,
          todayKey: todayKey,
          canceled: professorBookingIsVoid(status[lesson.bookingId]),
        );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const ProfessorLinksKicker('Aulas'),
        const SizedBox(height: 4),
        if (l == null)
          const ProfessorWalletLoading()
        else if (l.upcoming.isEmpty && l.past.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 8),
            child: ProfessorMutedText(
              'Nenhuma aula marcada. Em "Nova aula" você reserva a quadra '
              'como professor e o aluno recebe o aviso.',
            ),
          )
        else ...[
          if (l.upcoming.isNotEmpty) ...[
            const _SubKicker('Próximas'),
            for (final lesson in l.upcoming) row(lesson),
          ],
          if (past!.isNotEmpty) ...[
            const _SubKicker('Últimas'),
            for (final lesson in past) row(lesson),
          ],
        ],
        const SizedBox(height: 10),
        ProfessorLinksGhostButton(
          key: const Key('professor-wallet-new-lesson'),
          label: 'Nova aula',
          height: 42,
          onPressed: student.active && (arenas?.isNotEmpty ?? false)
              ? () => startProfessorLesson(
                    context,
                    ref,
                    athleteId: student.athleteId,
                    arenas: arenas!,
                  )
              : null,
        ),
        if (student.active && arenas != null && arenas.isEmpty) ...[
          const SizedBox(height: 6),
          const ProfessorActionHint(
            'Para marcar aula, peça a uma arena um vínculo independente com '
            '"Reservar quadras".',
          ),
        ],
      ],
    );
  }
}

class _SubKicker extends StatelessWidget {
  const _SubKicker(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(top: 8, bottom: 2),
        child: Text(
          text.toUpperCase(),
          style: ProfessorLinksStyle.mono(
            9.5,
            color: ProfessorLinksStyle.dim(context.themeColors),
          ).copyWith(letterSpacing: 0.8),
        ),
      );
}

class _LessonRow extends StatelessWidget {
  const _LessonRow({
    super.key,
    required this.lesson,
    required this.todayKey,
    required this.canceled,
  });

  final ProfessorLesson lesson;
  final String todayKey;
  final bool canceled;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final strike = canceled ? TextDecoration.lineThrough : null;
    final time =
        [lesson.startTime, lesson.endTime].where((t) => t.isNotEmpty).join('–');
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${professorDayLabel(lesson.date, todayKey)} · $time',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: ProfessorLinksStyle.display(
                    13,
                    weight: FontWeight.w600,
                    color: canceled
                        ? ProfessorLinksStyle.dim(colors)
                        : colors.onSurface,
                  ).copyWith(decoration: strike),
                ),
                const SizedBox(height: 2),
                Text(
                  '${lesson.arenaName} · ${lesson.courtName}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.bodyS.copyWith(
                    fontSize: 11.5,
                    color: ProfessorLinksStyle.dim(colors),
                    decoration: strike,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          if (canceled)
            const ProfessorWalletTag('Cancelada', color: AppColors.live)
          else
            Text(
              formatBRL(lesson.courtCostReais),
              style: ProfessorLinksStyle.mono(
                10.5,
                color: ProfessorLinksStyle.mute(colors),
              ),
            ),
        ],
      ),
    );
  }
}
