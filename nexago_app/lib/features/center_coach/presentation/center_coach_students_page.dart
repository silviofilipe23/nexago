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
import '../../professor_mode/presentation/availability/availability_widgets.dart';
import '../../professor_mode/presentation/widgets/professor_students_widgets.dart';
import '../application/center_coach_providers.dart';
import '../domain/center_students.dart';
import 'widgets/center_mode_tab_scope.dart';

/// G9 · Alunos do centro. Gestão, recepção e quem vê o financeiro enxergam
/// todos; o professor, só os dele (`coachUids`). A situação financeira só
/// aparece para quem vê o financeiro; para os outros, o bloqueio de check-in.
class CenterCoachStudentsPage extends ConsumerStatefulWidget {
  const CenterCoachStudentsPage({super.key, required this.centerId});

  final String centerId;

  @override
  ConsumerState<CenterCoachStudentsPage> createState() =>
      _CenterCoachStudentsPageState();
}

class _CenterCoachStudentsPageState
    extends ConsumerState<CenterCoachStudentsPage> {
  String _query = '';
  CenterStudentFilter _filter = CenterStudentFilter.all;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final centerId = widget.centerId;
    final member = ref.watch(centerMembershipProvider(centerId));
    final today = nexagoEventDayKey(ref.watch(professorLinksClockProvider)());
    final studentsAsync = ref.watch(coachStudentsProvider(centerId));
    final rows = buildCenterStudentRows(
      students: (studentsAsync.valueOrNull ?? const {}).values,
      enrollments:
          ref.watch(coachEnrollmentsProvider(centerId)).valueOrNull ?? const [],
      classes:
          ref.watch(coachClassesProvider(centerId)).valueOrNull ?? const [],
      invoices: ref.watch(coachInvoicesProvider(centerId)).valueOrNull,
      todayKey: today,
    );
    final shown = [
      for (final r in rows)
        if (centerStudentMatches(r, _filter, _query)) r,
    ];
    final mine = member != null && !member.seesAllStudents;

    return ProfessorLinksScaffold(
      showBack: !CenterModeTabScope.of(context),
      title: mine ? 'Meus alunos' : 'Alunos',
      subtitle: centerStudentsHeadline(rows),
      onBack: () => popOrGo(context, AppRoutes.centerCoachAgenda),
      body: ListView(
        padding: centerListPadding(context),
        children: [
          if (member == null || !member.isActive)
            const ProfessorLinksCard(
              child: ProfessorMutedText('Sem acesso a este centro.'),
            )
          else if (studentsAsync.isLoading && studentsAsync.valueOrNull == null)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 40),
              child: Center(
                child: CircularProgressIndicator(color: AppColors.brand),
              ),
            )
          else ...[
            TextField(
              key: const Key('center-students-search'),
              onChanged: (v) => setState(() => _query = v),
              style: AppTypography.bodyS.copyWith(color: colors.onSurface),
              decoration: InputDecoration(
                hintText: mine ? 'Buscar pelo nome' : 'Nome ou e-mail',
                prefixIcon: const Icon(Icons.search_rounded, size: 18),
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
            const SizedBox(height: 10),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  for (final f in CenterStudentFilter.values) ...[
                    AvailabilityChoiceChip(
                      key: Key('center-students-filter-${f.name}'),
                      label: kCenterStudentFilterLabels[f]!,
                      selected: _filter == f,
                      onTap: () => setState(() => _filter = f),
                    ),
                    const SizedBox(width: 6),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 12),
            if (shown.isEmpty)
              ProfessorLinksCard(
                key: const Key('center-students-empty'),
                child: ProfessorMutedText(
                  rows.isEmpty
                      ? (mine
                          ? 'Nenhum aluno nas suas turmas ainda.'
                          : 'Nenhum aluno cadastrado ainda.')
                      : 'Ninguém com esse filtro.',
                ),
              )
            else
              ProfessorLinksCard(
                padding: EdgeInsets.zero,
                child: Column(
                  children: [
                    for (final (i, r) in shown.indexed)
                      _StudentRow(
                        key: Key('center-students-row-${r.student.id}'),
                        row: r,
                        first: i == 0,
                        onTap: () => context.pushNamed(
                          AppRouteNames.centerCoachStudent,
                          pathParameters: {
                            'centerId': centerId,
                            'studentId': r.student.id,
                          },
                        ),
                      ),
                  ],
                ),
              ),
            if (mine) ...[
              const SizedBox(height: 12),
              Text(
                'Você vê os alunos das suas turmas. Matrícula e cobrança ficam '
                'com a gestão do centro.',
                textAlign: TextAlign.center,
                style: AppTypography.bodyS.copyWith(
                  fontSize: 11.5,
                  color: ProfessorLinksStyle.dim(colors),
                ),
              ),
            ],
          ],
        ],
      ),
    );
  }
}

/// Etiqueta da linha: bloqueado > atrasado/aguardando > convidado > menor.
(String, Color)? centerStudentRowTag(CenterStudentRow r) {
  final s = r.student;
  if (s.status == 'blocked') return ('Bloqueado', AppColors.live);
  if (r.finance?.state == CenterFinanceState.late) {
    return ('Atrasado', AppColors.live);
  }
  if (s.billingHold) return ('Pendência', AppColors.live);
  if (r.finance?.state == CenterFinanceState.pending) {
    return ('Aguardando', AppColors.pending);
  }
  if (s.status == 'invited') return ('Convidado', AppColors.brand);
  if (s.isMinor) return ('Menor', ProfessorLinksStyle.blue);
  return null;
}

class _StudentRow extends StatelessWidget {
  const _StudentRow({
    super.key,
    required this.row,
    required this.first,
    required this.onTap,
  });

  final CenterStudentRow row;
  final bool first;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final s = row.student;
    final tag = centerStudentRowTag(row);
    final sub = [
      if (row.className != '—') row.className,
      if (s.isMinor && s.guardianName.isNotEmpty)
        'resp. ${s.guardianName.split(' ').first}'
      else if (row.planName != '—')
        row.planName,
      if (s.makeupCredits > 0)
        s.makeupCredits == 1 ? '1 reposição' : '${s.makeupCredits} reposições',
    ].join(' · ');
    return InkWell(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.fromLTRB(14, 11, 12, 11),
        decoration: BoxDecoration(
          border: first
              ? null
              : Border(
                  top: BorderSide(color: ProfessorLinksStyle.line(colors)),
                ),
        ),
        child: Row(
          children: [
            ArenaClassAvatar(initials: arenaClassInitials(s.name), size: 36),
            const SizedBox(width: 11),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    s.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: ProfessorLinksStyle.display(
                      13.5,
                      weight: FontWeight.w700,
                      color: colors.onSurface,
                    ),
                  ),
                  if (sub.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(
                      sub,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.bodyS.copyWith(
                        fontSize: 11.5,
                        color: ProfessorLinksStyle.dim(colors),
                      ),
                    ),
                  ],
                ],
              ),
            ),
            if (tag != null) ...[
              const SizedBox(width: 8),
              ArenaClassTag(label: tag.$1, color: tag.$2),
            ],
            const SizedBox(width: 4),
            Icon(
              Icons.chevron_right_rounded,
              size: 16,
              color: ProfessorLinksStyle.dim(colors),
            ),
          ],
        ),
      ),
    );
  }
}
