import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/navigation_helpers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/time/nexago_event_timezone.dart';
import '../../athlete_training/domain/athlete_training.dart'
    show trainingWeekdayDay;
import '../../professor_links/application/professor_links_providers.dart';
import '../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../professor_mode/presentation/availability/availability_widgets.dart';
import '../../professor_mode/presentation/widgets/professor_students_widgets.dart';
import '../application/center_coach_providers.dart';
import '../domain/center_coach.dart';
import 'widgets/center_coach_widgets.dart';

/// P1/P2/L7 · Agenda do professor no centro: a semana, a próxima aula com
/// "Abrir chamada", as aulas do dia (com o local de cada uma — o centro pode
/// dar aula em mais de um lugar) e as turmas dele. Troca de centro no topo
/// para quem dá aula em mais de um.
class CenterCoachAgendaPage extends ConsumerStatefulWidget {
  const CenterCoachAgendaPage({super.key, this.centerId});

  /// Centro pedido pela rota (`?centro=`); sem ele, o escolhido ou o primeiro.
  final String? centerId;

  @override
  ConsumerState<CenterCoachAgendaPage> createState() =>
      _CenterCoachAgendaPageState();
}

class _CenterCoachAgendaPageState extends ConsumerState<CenterCoachAgendaPage> {
  String? _day;

  /// `all`, `mine` ou o uid de um professor; `null` = padrão do papel.
  String? _coach;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final membershipsAsync = ref.watch(myCenterMembershipsProvider);
    final all = membershipsAsync.valueOrNull;
    final active = ref.watch(activeCenterMembershipsProvider);
    final picked = widget.centerId ?? ref.watch(selectedCoachCenterIdProvider);
    CenterMembership? member;
    for (final m in active) {
      if (m.centerId == picked) member = m;
    }
    member ??= active.isEmpty ? null : active.first;
    final now = ref.watch(professorLinksClockProvider)();
    final today = nexagoEventDayKey(now);
    final day = _day ?? today;

    return ProfessorLinksScaffold(
      title: 'Agenda',
      subtitle: member == null
          ? 'CENTROS DE TREINAMENTO'
          : '${member.centerName.toUpperCase()} · ${member.roleLabel.toUpperCase()}',
      onBack: () => popOrGo(context, AppRoutes.home),
      body: Builder(
        builder: (context) {
          if (all == null) {
            return membershipsAsync.hasError
                ? Padding(
                    padding: const EdgeInsets.all(20),
                    child: ProfessorRetryCard(
                      message: 'Não foi possível carregar seus centros.',
                      onRetry: () =>
                          ref.invalidate(myCenterMembershipsProvider),
                    ),
                  )
                : const Center(
                    child: CircularProgressIndicator(color: AppColors.brand),
                  );
          }
          if (member == null) {
            final revoked = [
              for (final m in all)
                if (m.isRevoked) m,
            ];
            return ListView(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
              children: [
                if (revoked.isNotEmpty)
                  CenterCoachRevokedCard(
                    key: const Key('center-coach-revoked'),
                    centerName: revoked.first.centerName,
                  )
                else
                  const ProfessorLinksCard(
                    key: Key('center-coach-none'),
                    child: ProfessorMutedText(
                      'Você ainda não dá aula em nenhum centro de treinamento. '
                      'Quando um centro te convidar para a equipe, a agenda '
                      'aparece aqui.',
                    ),
                  ),
              ],
            );
          }
          return _AgendaBody(
            member: member,
            others: [
              for (final m in active)
                if (m.centerId != member.centerId) m,
            ],
            today: today,
            day: day,
            now: now,
            onDay: (d) => setState(() => _day = d),
            coachFilter: _coach,
            onCoach: (c) => setState(() => _coach = c),
            onSwitch: (id) {
              ref.read(selectedCoachCenterIdProvider.notifier).state = id;
              setState(() {
                _day = null;
                _coach = null;
              });
            },
            colors: colors,
          );
        },
      ),
    );
  }
}

class _AgendaBody extends ConsumerWidget {
  const _AgendaBody({
    required this.member,
    required this.others,
    required this.today,
    required this.day,
    required this.now,
    required this.onDay,
    required this.onSwitch,
    required this.colors,
    required this.coachFilter,
    required this.onCoach,
  });

  final String? coachFilter;
  final ValueChanged<String?> onCoach;
  final CenterMembership member;
  final List<CenterMembership> others;
  final String today;
  final String day;
  final DateTime now;
  final ValueChanged<String> onDay;
  final ValueChanged<String> onSwitch;
  final AppThemeColors colors;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final uid = ref.watch(professorLinksUidProvider);
    final centerId = member.centerId;
    final center = ref.watch(coachCenterProvider(centerId)).valueOrNull;
    final days = coachWeekKeys(coachShiftDay(today, -1));
    final range = (
      centerId: centerId,
      fromKey: coachShiftDay(today, -7),
      toKey: coachShiftDay(today, 14),
    );
    final sessionsAsync = ref.watch(coachSessionsProvider(range));
    // Gestão e recepção veem o centro inteiro (com filtro por professor); o
    // professor, as aulas dele.
    final staff = member.isManager || member.role == 'receptionist';
    final filter = coachFilter ?? (staff ? 'all' : 'mine');
    final all = sessionsAsync.valueOrNull ?? const <CenterCoachSession>[];
    final coaches = <String, String>{
      for (final s in all)
        if (s.coachUid.isNotEmpty && s.coachUid != uid)
          s.coachUid: s.coachName.isEmpty ? 'Professor' : s.coachName,
    };
    final mine =
        [
          for (final s in all)
            if (filter == 'all' ||
                (filter == 'mine' ? s.coachUid == uid : s.coachUid == filter))
              s,
        ]..sort(
          (a, b) =>
              '${a.date} ${a.startTime}'.compareTo('${b.date} ${b.startTime}'),
        );
    final ofDay = [
      for (final s in mine)
        if (s.date == day) s,
    ];
    final nowHm =
        '${toNexagoEventLocal(now).hour.toString().padLeft(2, '0')}:'
        '${toNexagoEventLocal(now).minute.toString().padLeft(2, '0')}';
    // A próxima de hoje ainda sem chamada fechada (inclusive a que passou
    // sem finalizar — a chamada segue aberta).
    CenterCoachSession? next;
    for (final s in mine) {
      if (s.date == today && !s.isCancelled && !s.isDone) {
        next = s;
        break;
      }
    }
    final places = {
      for (final s in ofDay)
        if (!s.isCancelled && s.locationName.isNotEmpty) s.locationName,
    };
    final classes = [
      for (final c
          in ref.watch(coachClassesProvider(centerId)).valueOrNull ??
              const <CenterCoachClass>[])
        if (c.coachUid == uid && (c.status == 'active' || c.status == 'draft'))
          c,
    ]..sort((a, b) => a.name.compareTo(b.name));

    return RefreshIndicator(
      color: AppColors.brand,
      onRefresh: () async => ref.invalidate(coachSessionsProvider(range)),
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
        children: [
          CenterCoachCenterChip(
            key: const Key('center-coach-switch'),
            name: member.centerName,
            role: member.roleLabel,
            canSwitch: others.isNotEmpty,
            onTap: others.isEmpty
                ? null
                : () => _showSwitch(context, ref, member, others, onSwitch),
          ),
          if (staff) ...[
            const SizedBox(height: 12),
            ProfessorLinksCard(
              key: const Key('center-coach-today-entry'),
              onTap: () => context.pushNamed(
                AppRouteNames.centerCoachToday,
                pathParameters: {'centerId': centerId},
              ),
              padding: const EdgeInsets.all(13),
              child: Row(
                children: [
                  Icon(
                    Icons.space_dashboard_outlined,
                    size: 20,
                    color: colors.brandText,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      'Hoje no centro · números e pendências',
                      style: ProfessorLinksStyle.display(
                        13.5,
                        weight: FontWeight.w600,
                        color: colors.onSurface,
                      ),
                    ),
                  ),
                  Icon(
                    Icons.chevron_right_rounded,
                    size: 18,
                    color: ProfessorLinksStyle.dim(colors),
                  ),
                ],
              ),
            ),
          ],
          if (staff) ...[
            const SizedBox(height: 8),
            ProfessorLinksPrimaryButton(
              key: const Key('center-coach-checkin-entry'),
              label: 'Fazer check-in',
              height: 46,
              onPressed: () => context.pushNamed(
                AppRouteNames.centerCoachCheckin,
                pathParameters: {'centerId': centerId},
              ),
            ),
          ],
          const SizedBox(height: 8),
          ProfessorLinksCard(
            key: const Key('center-coach-students-entry'),
            onTap: () => context.pushNamed(
              AppRouteNames.centerCoachStudents,
              pathParameters: {'centerId': centerId},
            ),
            padding: const EdgeInsets.all(13),
            child: Row(
              children: [
                Icon(
                  Icons.people_alt_outlined,
                  size: 20,
                  color: colors.brandText,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    member.seesAllStudents
                        ? 'Alunos do centro'
                        : 'Meus alunos no centro',
                    style: ProfessorLinksStyle.display(
                      13.5,
                      weight: FontWeight.w600,
                      color: colors.onSurface,
                    ),
                  ),
                ),
                Icon(
                  Icons.chevron_right_rounded,
                  size: 18,
                  color: ProfessorLinksStyle.dim(colors),
                ),
              ],
            ),
          ),
          if (staff || coaches.isNotEmpty && member.isManager) ...[
            const SizedBox(height: 10),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  for (final (k, l) in [
                    ('all', 'Todos'),
                    ('mine', 'Minhas'),
                    for (final e in coaches.entries)
                      (e.key, e.value.split(' ').first),
                  ]) ...[
                    AvailabilityChoiceChip(
                      key: Key('center-coach-filter-$k'),
                      label: l,
                      selected: filter == k,
                      onTap: () => onCoach(k),
                    ),
                    const SizedBox(width: 6),
                  ],
                ],
              ),
            ),
          ],
          if (center?.isSuspended ?? false) ...[
            const SizedBox(height: 10),
            const ProfessorLinksNote(
              'Centro suspenso: a agenda fica só para consulta até a '
              'assinatura ser regularizada.',
              tone: ProfessorLinksNoteTone.yellow,
            ),
          ],
          const SizedBox(height: 12),
          Row(
            children: [
              for (final d in days) ...[
                Expanded(
                  child: CenterCoachDayCell(
                    key: Key('center-coach-day-$d'),
                    dateKey: d,
                    selected: d == day,
                    isToday: d == today,
                    count: mine
                        .where((s) => s.date == d && !s.isCancelled)
                        .length,
                    onTap: () => onDay(d),
                  ),
                ),
                if (d != days.last) const SizedBox(width: 5),
              ],
            ],
          ),
          const SizedBox(height: 14),
          if (sessionsAsync.isLoading && sessionsAsync.valueOrNull == null)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 30),
              child: Center(
                child: CircularProgressIndicator(color: AppColors.brand),
              ),
            )
          else ...[
            if (day == today && next != null) ...[
              CenterCoachNextCard(
                key: const Key('center-coach-next'),
                session: next,
                now: now,
                canCall: coachCanTakeAttendance(
                  member: member,
                  center: center,
                  session: next,
                  uid: uid,
                  todayKey: today,
                ),
                onOpen: () => openCoachSession(context, centerId, next!.id),
              ),
              const SizedBox(height: 12),
            ],
            if (places.length > 1) ...[
              ProfessorLinksNote(
                'Dia em ${places.length} locais: ${places.join(', ')}. '
                'Confira o deslocamento entre as aulas.',
                tone: ProfessorLinksNoteTone.blue,
              ),
              const SizedBox(height: 10),
            ],
            Text(
              '${trainingWeekdayDay(day)} · '
              '${ofDay.where((s) => !s.isCancelled).length} '
              '${ofDay.where((s) => !s.isCancelled).length == 1 ? 'AULA' : 'AULAS'} NESTE CENTRO',
              style: ProfessorLinksStyle.mono(
                10,
                color: ProfessorLinksStyle.dim(colors),
              ).copyWith(letterSpacing: 0.6),
            ),
            const SizedBox(height: 10),
            if (ofDay.isEmpty)
              const ProfessorLinksCard(
                key: Key('center-coach-day-empty'),
                child: ProfessorMutedText('Nenhuma aula sua neste dia.'),
              ),
            for (final s in ofDay) ...[
              CenterCoachSessionRow(
                key: Key('center-coach-row-${s.id}'),
                session: s,
                showPlace: places.length > 1,
                showCoach: filter != 'mine',
                isPast:
                    s.date.compareTo(today) < 0 ||
                    (s.date == today &&
                        s.endTime.isNotEmpty &&
                        s.endTime.compareTo(nowHm) < 0),
                onTap: () => openCoachSession(context, centerId, s.id),
              ),
              const SizedBox(height: 8),
            ],
          ],
          if (classes.isNotEmpty) ...[
            const SizedBox(height: 10),
            Text(
              'MINHAS TURMAS',
              style: ProfessorLinksStyle.mono(
                10,
                color: ProfessorLinksStyle.dim(colors),
              ).copyWith(letterSpacing: 0.6),
            ),
            const SizedBox(height: 10),
            for (final c in classes) ...[
              CenterCoachClassRow(
                key: Key('center-coach-class-${c.id}'),
                cls: c,
                onTap: () => context.pushNamed(
                  AppRouteNames.centerCoachClass,
                  pathParameters: {'centerId': centerId, 'classId': c.id},
                ),
              ),
              const SizedBox(height: 8),
            ],
          ],
          if (others.isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(
              'Você também dá aula ${others.length == 1 ? 'no ${others.first.centerName}' : 'em mais ${others.length} centros'} — troque o centro no topo.',
              textAlign: TextAlign.center,
              style: AppTypography.bodyS.copyWith(
                fontSize: 11.5,
                color: ProfessorLinksStyle.dim(colors),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

void openCoachSession(
  BuildContext context,
  String centerId,
  String sessionId,
) => context.pushNamed(
  AppRouteNames.centerCoachSession,
  pathParameters: {'centerId': centerId, 'sessionId': sessionId},
);

/// P2 · Trocar centro.
Future<void> _showSwitch(
  BuildContext context,
  WidgetRef ref,
  CenterMembership current,
  List<CenterMembership> others,
  ValueChanged<String> onSwitch,
) async {
  final picked = await showProfessorLinksSheet<String>(
    context,
    builder: (sheet) => ProfessorLinksSheetBody(
      key: const Key('center-coach-switch-sheet'),
      title: 'Trocar centro',
      subtitle: 'Cada centro tem suas turmas e permissões',
      children: [
        for (final m in [current, ...others])
          CenterCoachCenterOption(
            key: Key('center-coach-option-${m.centerId}'),
            membership: m,
            selected: m.centerId == current.centerId,
            onTap: () => Navigator.of(sheet).pop(m.centerId),
          ),
      ],
    ),
  );
  if (picked != null && picked != current.centerId) onSwitch(picked);
}
