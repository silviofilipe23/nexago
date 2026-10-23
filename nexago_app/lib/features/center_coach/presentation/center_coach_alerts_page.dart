import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/navigation_helpers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/time/nexago_event_timezone.dart';
import '../../professor_links/application/professor_links_providers.dart';
import '../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../professor_mode/presentation/availability/availability_widgets.dart';
import '../../professor_mode/presentation/widgets/professor_students_widgets.dart';
import '../application/center_coach_providers.dart';
import '../domain/center_alerts.dart';
import 'center_coach_agenda_page.dart' show openCoachSession;

/// G3 · Alertas do centro (owner/admin): o que aconteceu no centro, por dia,
/// com filtro por área. Vem da trilha de auditoria; toque na aula ou no aluno
/// abre a tela dele.
class CenterCoachAlertsPage extends ConsumerStatefulWidget {
  const CenterCoachAlertsPage({super.key, required this.centerId});

  final String centerId;

  @override
  ConsumerState<CenterCoachAlertsPage> createState() =>
      _CenterCoachAlertsPageState();
}

class _CenterCoachAlertsPageState extends ConsumerState<CenterCoachAlertsPage> {
  CenterAlertCategory? _filter;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final centerId = widget.centerId;
    final member = ref.watch(centerMembershipProvider(centerId));
    final today = nexagoEventDayKey(ref.watch(professorLinksClockProvider)());
    final async = ref.watch(coachAuditLogsProvider(centerId));
    final all = async.valueOrNull ?? const <CenterAuditEntry>[];
    final shown = [
      for (final e in all)
        if (_filter == null || centerAlertCategory(e.action) == _filter) e,
    ];
    final groups = centerAlertGroups(
      shown,
      todayKey: today,
      localDayKey: nexagoEventDayKey,
    );
    final todayCount = groups.isNotEmpty && groups.first.$1 == 'Hoje'
        ? groups.first.$2.length
        : 0;

    return ProfessorLinksScaffold(
      title: 'Alertas',
      subtitle: '${member?.centerName.toUpperCase() ?? 'CENTRO'} · '
          '${todayCount == 1 ? '1 HOJE' : '$todayCount HOJE'}',
      onBack: () => popOrGo(context, AppRoutes.centerCoachAgenda),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
        children: [
          if (member == null || !member.isManager)
            const ProfessorLinksCard(
              key: Key('center-alerts-denied'),
              child: ProfessorMutedText(
                'Os alertas do centro ficam com o owner e os admins.',
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
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  for (final f in <CenterAlertCategory?>[
                    null,
                    CenterAlertCategory.finance,
                    CenterAlertCategory.schedule,
                    CenterAlertCategory.enrollments,
                    CenterAlertCategory.team,
                  ]) ...[
                    AvailabilityChoiceChip(
                      key: Key('center-alerts-filter-${f?.name ?? 'all'}'),
                      label:
                          f == null ? 'Todos' : kCenterAlertCategoryLabels[f]!,
                      selected: _filter == f,
                      onTap: () => setState(() => _filter = f),
                    ),
                    const SizedBox(width: 6),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 14),
            if (groups.isEmpty)
              ProfessorLinksCard(
                key: const Key('center-alerts-empty'),
                child: ProfessorMutedText(
                  all.isEmpty
                      ? 'Nada aconteceu no centro ainda.'
                      : 'Nada nesta área por enquanto.',
                ),
              ),
            for (final (label, items) in groups) ...[
              Text(
                label.toUpperCase(),
                style: ProfessorLinksStyle.mono(
                  10,
                  color: ProfessorLinksStyle.dim(colors),
                ).copyWith(letterSpacing: 0.6),
              ),
              const SizedBox(height: 8),
              ProfessorLinksCard(
                padding: EdgeInsets.zero,
                child: Column(
                  children: [
                    for (final (i, e) in items.indexed)
                      _AlertRow(
                        key: Key('center-alert-${e.id}'),
                        entry: e,
                        first: i == 0,
                        onTap: _target(context, e),
                      ),
                  ],
                ),
              ),
              const SizedBox(height: 14),
            ],
          ],
        ],
      ),
    );
  }

  VoidCallback? _target(BuildContext context, CenterAuditEntry e) {
    if (e.entityId.isEmpty) return null;
    return switch (e.entity) {
      'session' => () => openCoachSession(context, widget.centerId, e.entityId),
      'student' => () => context.pushNamed(
            AppRouteNames.centerCoachStudent,
            pathParameters: {
              'centerId': widget.centerId,
              'studentId': e.entityId
            },
          ),
      'enrollment' => () => context.pushNamed(
        AppRouteNames.centerCoachWaitlist,
        pathParameters: {'centerId': widget.centerId},
      ),
      'invoice' => () => context.pushNamed(
        AppRouteNames.centerCoachInvoice,
        pathParameters: {'centerId': widget.centerId, 'invoiceId': e.entityId},
      ),
      _ => null,
    };
  }
}

Color _toneColor(String tone, AppThemeColors colors) => switch (tone) {
      'red' => AppColors.live,
      'green' => AppColors.win,
      'yellow' => AppColors.pending,
      'orange' => AppColors.brand,
      _ => ProfessorLinksStyle.dim(colors),
    };

class _AlertRow extends StatelessWidget {
  const _AlertRow({
    super.key,
    required this.entry,
    required this.first,
    this.onTap,
  });

  final CenterAuditEntry entry;
  final bool first;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final e = entry;
    final local = toNexagoEventLocal(e.at!);
    final hm = '${local.hour.toString().padLeft(2, '0')}:'
        '${local.minute.toString().padLeft(2, '0')}';
    final foot = [
      if (e.reason.isNotEmpty) 'Motivo: ${e.reason}',
      if (e.actorName.isNotEmpty) 'por ${e.actorName}',
    ].join(' · ');
    return InkWell(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.fromLTRB(14, 12, 12, 12),
        decoration: BoxDecoration(
          border: first
              ? null
              : Border(
                  top: BorderSide(color: ProfessorLinksStyle.line(colors)),
                ),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.only(top: 5),
              child: Container(
                width: 8,
                height: 8,
                decoration: BoxDecoration(
                  color: _toneColor(centerAlertTone(e.action), colors),
                  shape: BoxShape.circle,
                ),
              ),
            ),
            const SizedBox(width: 11),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.baseline,
                    textBaseline: TextBaseline.alphabetic,
                    children: [
                      Expanded(
                        child: Text(
                          centerAlertTitle(e.action),
                          style: ProfessorLinksStyle.display(
                            13.5,
                            weight: FontWeight.w700,
                            color: colors.onSurface,
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        hm,
                        style: ProfessorLinksStyle.mono(
                          9.5,
                          color: ProfessorLinksStyle.dim(colors),
                        ),
                      ),
                    ],
                  ),
                  if (e.detail.isNotEmpty) ...[
                    const SizedBox(height: 3),
                    Text(
                      e.detail,
                      style: AppTypography.bodyS.copyWith(
                        fontSize: 12,
                        height: 1.4,
                        color: ProfessorLinksStyle.mute(colors),
                      ),
                    ),
                  ],
                  if (foot.isNotEmpty) ...[
                    const SizedBox(height: 3),
                    Text(
                      foot,
                      style: AppTypography.bodyS.copyWith(
                        fontSize: 11,
                        color: ProfessorLinksStyle.dim(colors),
                      ),
                    ),
                  ],
                ],
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
      ),
    );
  }
}
