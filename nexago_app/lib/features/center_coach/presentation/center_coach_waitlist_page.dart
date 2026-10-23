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
import '../../professor_links/application/professor_links_providers.dart';
import '../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../professor_mode/presentation/widgets/professor_students_widgets.dart';
import '../application/center_coach_providers.dart';
import '../domain/center_coach.dart';
import '../domain/center_waitlist.dart';
import 'widgets/center_coach_widgets.dart' show coachClassScheduleLabel;

String _hm(DateTime at) {
  final l = toNexagoEventLocal(at);
  return '${l.hour.toString().padLeft(2, '0')}:'
      '${l.minute.toString().padLeft(2, '0')}';
}

/// G14 · Lista de espera (gestão e recepção): a fila de cada turma, as vagas
/// oferecidas aguardando pagamento e as ofertas que já terminaram. A oferta é
/// automática: abriu vaga, o 1º da fila recebe.
class CenterCoachWaitlistPage extends ConsumerWidget {
  const CenterCoachWaitlistPage({super.key, required this.centerId});

  final String centerId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final member = ref.watch(centerMembershipProvider(centerId));
    final now = ref.watch(professorLinksClockProvider)();
    final async = ref.watch(coachEnrollmentsProvider(centerId));
    final classes =
        ref.watch(coachClassesProvider(centerId)).valueOrNull ?? const [];
    final plans =
        ref.watch(coachPlanNamesProvider(centerId)).valueOrNull ?? const {};
    final list = buildCenterWaitlist(
      enrollments: async.valueOrNull ?? const [],
      classes: classes,
      now: now,
    );
    final allowed =
        member != null && (member.isManager || member.has('enroll_students'));
    final size = centerQueueSize(list);

    return ProfessorLinksScaffold(
      title: 'Lista de espera',
      subtitle: size == 1 ? '1 PESSOA NA FILA' : '$size PESSOAS NA FILA',
      onBack: () => popOrGo(context, AppRoutes.centerCoachAgenda),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
        children: [
          if (!allowed)
            const ProfessorLinksCard(
              key: Key('center-waitlist-denied'),
              child: ProfessorMutedText(
                'A lista de espera fica com a gestão e a recepção do centro.',
              ),
            )
          else if (async.isLoading && async.valueOrNull == null)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 40),
              child: Center(
                child: CircularProgressIndicator(color: AppColors.brand),
              ),
            )
          else ...[
            const ProfessorLinksNote(
              'Quando abre vaga, ela vai sozinha para o 1º da fila, com a '
              'cobrança. Se não pagar no prazo, passa para o próximo.',
              tone: ProfessorLinksNoteTone.blue,
            ),
            const SizedBox(height: 14),
            if (list.isEmpty)
              const ProfessorLinksCard(
                key: Key('center-waitlist-empty'),
                child: ProfessorMutedText('Ninguém na lista de espera.'),
              ),
            for (final c in list) ...[
              _ClassSection(
                key: Key('center-waitlist-class-${c.classId}'),
                centerId: centerId,
                group: c,
                plans: plans,
                now: now,
              ),
              const SizedBox(height: 18),
            ],
          ],
        ],
      ),
    );
  }
}

class _ClassSection extends StatelessWidget {
  const _ClassSection({
    super.key,
    required this.centerId,
    required this.group,
    required this.plans,
    required this.now,
  });

  final String centerId;
  final CenterWaitlistClass group;
  final Map<String, String> plans;
  final DateTime now;

  void _open(BuildContext context, String studentId) => context.pushNamed(
        AppRouteNames.centerCoachStudent,
        pathParameters: {'centerId': centerId, 'studentId': studentId},
      );

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final g = group;
    final free = g.freeSeats;
    final schedule = g.cls == null ? '' : coachClassScheduleLabel(g.cls!);
    Text kicker(String t) => Text(
          t.toUpperCase(),
          style: ProfessorLinksStyle.mono(
            9.5,
            color: ProfessorLinksStyle.dim(colors),
          ).copyWith(letterSpacing: 0.6),
        );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    g.className,
                    style: ProfessorLinksStyle.display(
                      15,
                      color: colors.onSurface,
                    ),
                  ),
                  if (schedule.isNotEmpty)
                    Text(
                      schedule,
                      style: AppTypography.bodyS.copyWith(
                        fontSize: 11.5,
                        color: ProfessorLinksStyle.dim(colors),
                      ),
                    ),
                ],
              ),
            ),
            if (free != null)
              ArenaClassTag(
                label: free == 0
                    ? 'Lotada'
                    : free == 1
                        ? '1 vaga'
                        : '$free vagas',
                color:
                    free == 0 ? ProfessorLinksStyle.dim(colors) : AppColors.win,
              ),
          ],
        ),
        if (g.offers.isNotEmpty) ...[
          const SizedBox(height: 10),
          for (final e in g.offers) ...[
            ProfessorLinksCard(
              key: Key('center-waitlist-offer-${e.id}'),
              onTap: () => _open(context, e.studentId),
              padding: const EdgeInsets.all(12),
              borderColor: AppColors.win.withValues(alpha: 0.35),
              child: Row(
                children: [
                  ArenaClassAvatar(
                    initials: arenaClassInitials(e.studentName),
                    size: 34,
                    color: AppColors.win,
                  ),
                  const SizedBox(width: 11),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          e.studentName.isEmpty ? 'Aluno' : e.studentName,
                          style: ProfessorLinksStyle.display(
                            13.5,
                            weight: FontWeight.w700,
                            color: colors.onSurface,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          centerOfferLine(
                            e,
                            now: now,
                            localDayKey: nexagoEventDayKey,
                            localHm: _hm,
                          ),
                          style: AppTypography.bodyS.copyWith(
                            fontSize: 11,
                            color: ProfessorLinksStyle.dim(colors),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const ArenaClassTag(
                      label: 'Aguardando', color: AppColors.pending),
                ],
              ),
            ),
            const SizedBox(height: 8),
          ],
        ],
        const SizedBox(height: 10),
        kicker(
          g.queue.isEmpty
              ? 'Fila vazia'
              : 'Fila · ${g.queue.length == 1 ? '1 pessoa' : '${g.queue.length} pessoas'}',
        ),
        for (final (i, e) in g.queue.indexed) ...[
          const SizedBox(height: 8),
          ProfessorLinksCard(
            key: Key('center-waitlist-queue-${e.id}'),
            onTap: () => _open(context, e.studentId),
            padding: const EdgeInsets.all(12),
            borderColor: i == 0 ? AppColors.brand.withValues(alpha: 0.4) : null,
            child: Row(
              children: [
                SizedBox(
                  width: 24,
                  child: Text(
                    '${i + 1}º',
                    style: ProfessorLinksStyle.mono(
                      12,
                      weight: FontWeight.w700,
                      color: i == 0
                          ? colors.brandText
                          : ProfessorLinksStyle.dim(colors),
                    ),
                  ),
                ),
                ArenaClassAvatar(
                  initials: arenaClassInitials(e.studentName),
                  size: 34,
                ),
                const SizedBox(width: 11),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        e.studentName.isEmpty ? 'Aluno' : e.studentName,
                        style: ProfessorLinksStyle.display(
                          13.5,
                          weight: FontWeight.w700,
                          color: colors.onSurface,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        centerQueueLine(
                          e,
                          planNames: plans,
                          localDayKey: nexagoEventDayKey,
                        ),
                        style: AppTypography.bodyS.copyWith(
                          fontSize: 11,
                          color: ProfessorLinksStyle.dim(colors),
                        ),
                      ),
                    ],
                  ),
                ),
                Icon(
                  Icons.chevron_right_rounded,
                  size: 16,
                  color: ProfessorLinksStyle.dim(colors),
                ),
              ],
            ),
          ),
        ],
        if (g.past.isNotEmpty) ...[
          const SizedBox(height: 14),
          kicker('Ofertas anteriores'),
          const SizedBox(height: 8),
          ProfessorLinksCard(
            padding: EdgeInsets.zero,
            child: Column(
              children: [
                for (final (i, e) in g.past.take(5).indexed)
                  _PastRow(
                    key: Key('center-waitlist-past-${e.id}'),
                    enrollment: e,
                    first: i == 0,
                  ),
              ],
            ),
          ),
        ],
      ],
    );
  }
}

class _PastRow extends StatelessWidget {
  const _PastRow({super.key, required this.enrollment, required this.first});

  final CenterCoachEnrollment enrollment;
  final bool first;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final (line, tone) = centerPastOfferLine(
      enrollment,
      localDayKey: nexagoEventDayKey,
    );
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 11, 14, 11),
      decoration: BoxDecoration(
        border: first
            ? null
            : Border(top: BorderSide(color: ProfessorLinksStyle.line(colors))),
      ),
      child: Row(
        children: [
          Container(
            width: 8,
            height: 8,
            decoration: BoxDecoration(
              color: tone == 'green'
                  ? AppColors.win
                  : ProfessorLinksStyle.dim(colors),
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  enrollment.studentName.isEmpty
                      ? 'Aluno'
                      : enrollment.studentName,
                  style: ProfessorLinksStyle.display(
                    13,
                    weight: FontWeight.w600,
                    color: colors.onSurface,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  line,
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
    );
  }
}
