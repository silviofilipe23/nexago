import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/formatting/app_currency_format.dart';
import '../../../core/router/navigation_helpers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/time/nexago_event_timezone.dart';
import '../../professor_links/application/professor_links_providers.dart';
import '../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../professor_mode/presentation/widgets/professor_students_widgets.dart';
import '../application/center_coach_providers.dart';
import '../domain/center_coach.dart';
import 'center_coach_agenda_page.dart' show openCoachSession;
import 'widgets/center_coach_widgets.dart';

/// G1/G2/G3 · Hoje no centro (gestão e recepção): a aula de agora, os números
/// do centro, o recebido no mês (só com financeiro), as pendências e as
/// próximas aulas do dia. A recepção não vê valores.
class CenterCoachTodayPage extends ConsumerWidget {
  const CenterCoachTodayPage({super.key, required this.centerId});

  final String centerId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final member = ref.watch(centerMembershipProvider(centerId));
    final now = ref.watch(professorLinksClockProvider)();
    final today = nexagoEventDayKey(now);
    final local = toNexagoEventLocal(now);
    final nowHm =
        '${local.hour.toString().padLeft(2, '0')}:${local.minute.toString().padLeft(2, '0')}';
    final range = (
      centerId: centerId,
      fromKey: coachShiftDay(today, -3),
      toKey: today,
    );
    final sessionsAsync = ref.watch(coachSessionsProvider(range));
    final sessions = sessionsAsync.valueOrNull ?? const <CenterCoachSession>[];
    final classes =
        ref.watch(coachClassesProvider(centerId)).valueOrNull ?? const [];
    final enrollments =
        ref.watch(coachEnrollmentsProvider(centerId)).valueOrNull ?? const [];
    final invoices = ref.watch(coachInvoicesProvider(centerId)).valueOrNull;
    final students =
        ref.watch(coachStudentsProvider(centerId)).valueOrNull ?? const {};
    final summary = centerTodaySummary(
      todayKey: today,
      nowHm: nowHm,
      sessions: sessions,
      classes: classes,
      enrollments: enrollments,
      activeStudents: students.values.where((s) => s.status == 'active').length,
      invoices: invoices,
    );
    final ofToday = [
      for (final s in sessions)
        if (s.date == today) s,
    ]..sort((a, b) => a.startTime.compareTo(b.startTime));
    CenterCoachSession? live;
    for (final s in ofToday) {
      if (!s.isCancelled &&
          s.startTime.compareTo(nowHm) <= 0 &&
          s.endTime.compareTo(nowHm) > 0) {
        live = s;
      }
    }
    final upcoming = [
      for (final s in ofToday)
        if (s.startTime.compareTo(nowHm) > 0) s,
    ];
    final done = ofToday.where((s) => s.isDone).length;

    return ProfessorLinksScaffold(
      title: 'Hoje',
      subtitle:
          '${member?.centerName.toUpperCase() ?? 'CENTRO'} · '
          '${ofToday.where((s) => !s.isCancelled).length} AULAS · $done REALIZADAS',
      onBack: () => popOrGo(context, AppRoutes.centerCoachAgenda),
      body: RefreshIndicator(
        color: AppColors.brand,
        onRefresh: () async => ref.invalidate(coachSessionsProvider(range)),
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
          children: [
            if (member == null || !member.isActive)
              const ProfessorLinksCard(
                child: ProfessorMutedText('Sem acesso a este centro.'),
              )
            else if (sessionsAsync.isLoading &&
                sessionsAsync.valueOrNull == null)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 40),
                child: Center(
                  child: CircularProgressIndicator(color: AppColors.brand),
                ),
              )
            else ...[
              ProfessorLinksPrimaryButton(
                key: const Key('center-today-checkin'),
                label: 'Fazer check-in',
                height: 52,
                onPressed: () => context.pushNamed(
                  AppRouteNames.centerCoachCheckin,
                  pathParameters: {'centerId': centerId},
                ),
              ),
              const SizedBox(height: 12),
              if (live != null) ...[
                _LiveCard(
                  key: const Key('center-today-live'),
                  session: live,
                  onOpen: () => openCoachSession(context, centerId, live!.id),
                ),
                const SizedBox(height: 12),
              ],
              Row(
                children: [
                  Expanded(
                    child: _Stat(
                      key: const Key('center-today-students'),
                      value: '${summary.activeStudents}',
                      label: 'alunos',
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: _Stat(
                      value: summary.occupancyPercent == null
                          ? '—'
                          : '${summary.occupancyPercent}%',
                      label: 'ocupação',
                      color: AppColors.brand,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: _Stat(
                      value: summary.presencePercent == null
                          ? '—'
                          : '${summary.presencePercent}%',
                      label: 'presença',
                    ),
                  ),
                ],
              ),
              if (summary.receivedMonthCents != null) ...[
                const SizedBox(height: 12),
                _MoneyCard(
                  key: const Key('center-today-money'),
                  received: summary.receivedMonthCents!,
                  open: summary.openCents ?? 0,
                  overdue: summary.overdueCents ?? 0,
                ),
              ],
              const SizedBox(height: 16),
              Text(
                'PENDÊNCIAS · ${summary.pending.length}',
                style: ProfessorLinksStyle.mono(
                  10,
                  color: ProfessorLinksStyle.dim(colors),
                ).copyWith(letterSpacing: 0.6),
              ),
              const SizedBox(height: 10),
              if (summary.pending.isEmpty)
                const ProfessorLinksCard(
                  key: Key('center-today-no-pending'),
                  child: ProfessorMutedText('Tudo em dia por aqui.'),
                )
              else
                ProfessorLinksCard(
                  padding: EdgeInsets.zero,
                  child: Column(
                    children: [
                      for (final (i, p) in summary.pending.indexed)
                        _PendingRow(
                          key: Key('center-today-pending-$i'),
                          pending: p,
                          first: i == 0,
                          onTap: p.sessionId == null
                              ? null
                              : () => openCoachSession(
                                  context,
                                  centerId,
                                  p.sessionId!,
                                ),
                        ),
                    ],
                  ),
                ),
              if (upcoming.isNotEmpty) ...[
                const SizedBox(height: 16),
                Text(
                  'PRÓXIMAS AULAS',
                  style: ProfessorLinksStyle.mono(
                    10,
                    color: ProfessorLinksStyle.dim(colors),
                  ).copyWith(letterSpacing: 0.6),
                ),
                const SizedBox(height: 10),
                for (final s in upcoming) ...[
                  CenterCoachSessionRow(
                    key: Key('center-today-row-${s.id}'),
                    session: s,
                    isPast: false,
                    showCoach: true,
                    onTap: () => openCoachSession(context, centerId, s.id),
                  ),
                  const SizedBox(height: 8),
                ],
              ],
              if (summary.receivedMonthCents == null) ...[
                const SizedBox(height: 10),
                Text(
                  'Você vê a situação das aulas e dos alunos, mas não os valores '
                  'recebidos.',
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
      ),
    );
  }
}

class _LiveCard extends StatelessWidget {
  const _LiveCard({super.key, required this.session, required this.onOpen});

  final CenterCoachSession session;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final s = session;
    final marked = s.attendance.values
        .where((m) => m == CenterMark.present)
        .length;
    return Container(
      padding: const EdgeInsets.all(15),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(20),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [AppColors.live.withValues(alpha: 0.14), colors.surfaceCard],
          stops: const [0, 0.6],
        ),
        border: Border.all(color: AppColors.live.withValues(alpha: 0.3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Container(
                width: 6,
                height: 6,
                decoration: const BoxDecoration(
                  color: AppColors.live,
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: 6),
              Text(
                'AGORA · ${s.startTime}–${s.endTime}',
                style: ProfessorLinksStyle.mono(
                  9.5,
                  color: colors.readableTone(AppColors.live),
                ),
              ),
            ],
          ),
          const SizedBox(height: 7),
          Text(
            s.className,
            style: ProfessorLinksStyle.display(20, color: colors.onSurface),
          ),
          const SizedBox(height: 3),
          Text(
            [
              if (s.coachName.isNotEmpty) s.coachName,
              s.placeLabel,
              '$marked presentes',
            ].where((x) => x.isNotEmpty).join(' · ').toUpperCase(),
            style: ProfessorLinksStyle.mono(
              10.5,
              color: ProfessorLinksStyle.mute(colors),
            ),
          ),
          const SizedBox(height: 12),
          ProfessorLinksGhostButton(
            key: const Key('center-today-live-open'),
            label: 'Ver aula',
            height: 40,
            onPressed: onOpen,
          ),
        ],
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({
    super.key,
    required this.value,
    required this.label,
    this.color,
  });

  final String value;
  final String label;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 11, 12, 11),
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: ProfessorLinksStyle.line(colors)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            value,
            style: ProfessorLinksStyle.display(
              18,
              color: color == null
                  ? colors.onSurface
                  : colors.readableTone(color!),
            ),
          ),
          Text(
            label,
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

class _MoneyCard extends StatelessWidget {
  const _MoneyCard({
    super.key,
    required this.received,
    required this.open,
    required this.overdue,
  });

  final int received;
  final int open;
  final int overdue;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final waiting = (open - overdue).clamp(0, open);
    final total = received + open;
    return ProfessorLinksCard(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'RECEBIDO NO MÊS',
                  style: ProfessorLinksStyle.mono(
                    9.5,
                    color: ProfessorLinksStyle.dim(colors),
                  ),
                ),
              ),
              if (total > 0)
                Text(
                  '${(received * 100 / total).round()}% DO COBRADO',
                  style: ProfessorLinksStyle.mono(
                    9.5,
                    color: ProfessorLinksStyle.dim(colors),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            formatBRLFromCents(received),
            style: ProfessorLinksStyle.display(
              24,
              color: colors.readableTone(AppColors.win),
            ),
          ),
          if (total > 0) ...[
            const SizedBox(height: 10),
            ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: Row(
                children: [
                  for (final (v, c) in [
                    (received, AppColors.win),
                    (waiting, AppColors.pending),
                    (overdue, AppColors.live),
                  ])
                    if (v > 0)
                      Expanded(
                        flex: v,
                        child: Container(height: 7, color: c),
                      ),
                ],
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Aguardando ${formatBRLFromCents(waiting)} · '
              'Vencido ${formatBRLFromCents(overdue)}',
              style: ProfessorLinksStyle.mono(
                10,
                color: ProfessorLinksStyle.mute(colors),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _PendingRow extends StatelessWidget {
  const _PendingRow({
    super.key,
    required this.pending,
    required this.first,
    this.onTap,
  });

  final CenterTodayPending pending;
  final bool first;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final color = switch (pending.kind) {
      'attendance' => AppColors.pending,
      'waitlist' => AppColors.brand,
      'overdue' || 'cancelled' => AppColors.live,
      _ => ProfessorLinksStyle.dim(colors),
    };
    return InkWell(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
        decoration: BoxDecoration(
          border: first
              ? null
              : Border(
                  top: BorderSide(color: ProfessorLinksStyle.line(colors)),
                ),
        ),
        child: Row(
          children: [
            Container(
              width: 8,
              height: 8,
              decoration: BoxDecoration(color: color, shape: BoxShape.circle),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    pending.title,
                    style: ProfessorLinksStyle.display(
                      13,
                      weight: FontWeight.w600,
                      color: colors.onSurface,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    pending.subtitle,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.bodyS.copyWith(
                      fontSize: 11.5,
                      color: ProfessorLinksStyle.dim(colors),
                    ),
                  ),
                ],
              ),
            ),
            if (onTap != null)
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
