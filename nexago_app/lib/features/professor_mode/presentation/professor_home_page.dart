import 'dart:async';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/layout/nexa_page_header.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../athlete/domain/athlete_display_name.dart';
import '../../athlete/domain/athlete_notifications_providers.dart';
import '../../athlete/domain/athlete_profile_providers.dart';
import '../../auth/domain/role_selection_providers.dart';
import '../../professor_links/application/professor_links_providers.dart';
import '../../professor_links/domain/arena_professor_link.dart';
import '../../professor_links/domain/professor_link_rules.dart';
import '../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../application/professor_agenda_providers.dart';
import '../application/professor_lesson_plans_providers.dart';
import '../application/professor_notices_providers.dart';
import '../application/professor_today_providers.dart';
import '../domain/professor_agenda.dart';
import '../domain/professor_mode_logic.dart';
import '../domain/professor_today.dart';
import '../infrastructure/professor_students_repository.dart'
    show ProfessorStudentsException;
import 'agenda/professor_agenda_widgets.dart';
import 'lesson_plans/lesson_live_page.dart'
    show openLessonLive, openLessonReview;
import 'lesson_plans/lesson_plan_widgets.dart' show openLessonPlanEditor;
import 'professor_shell_page.dart';
import 'widgets/professor_settings_sheet.dart';

/// Hoje do modo Professor (J1/J2, `pa-app-hoje.jsx`): a visão unificada das
/// arenas. "Agora" (aula em andamento ou começando em até 1h) ou, sem nada
/// rolando, o resumo do dia e a próxima aula; as próximas de hoje, o que
/// precisa do professor (só fontes com contagem) e a linha do dia. Tudo
/// vem dos itens da agenda (parede de São Paulo) e do que o app já tem.
class ProfessorHomePage extends ConsumerStatefulWidget {
  const ProfessorHomePage({super.key});

  @override
  ConsumerState<ProfessorHomePage> createState() => _ProfessorHomePageState();
}

class _ProfessorHomePageState extends ConsumerState<ProfessorHomePage> {
  Timer? _ticker;

  @override
  void initState() {
    super.initState();
    final every = ref.read(professorTodayRefreshIntervalProvider);
    if (every != null) {
      _ticker = Timer.periodic(every, (_) {
        if (mounted) ref.invalidate(professorTodayNowProvider);
      });
    }
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final wall = ref.watch(professorTodayWallProvider);
    final range = ref.watch(professorTodayRangeProvider);
    final async = ref.watch(professorTodayItemsProvider);
    final items = async.valueOrNull;
    final links = ref.watch(myProfessorLinksProvider).valueOrNull;
    final pendings = ref.watch(professorTodayPendingsProvider);

    final children = <Widget>[];
    if (items == null) {
      children.add(
        async.hasError
            ? ProfessorLinksCard(
                key: const Key('professor-home-error'),
                onTap: () =>
                    ref.invalidate(professorAgendaSessionsProvider(range)),
                child: _MutedLine(
                  async.error is ProfessorStudentsException
                      ? '${(async.error as ProfessorStudentsException).message}'
                          ' Toque para tentar de novo.'
                      : 'Não foi possível carregar suas aulas. Toque para '
                          'tentar de novo.',
                ),
              )
            : const Padding(
                padding: EdgeInsets.symmetric(vertical: 30),
                child: Center(
                  child: CircularProgressIndicator(color: AppColors.brand),
                ),
              ),
      );
    } else {
      final slot = professorNowSlot(
        items,
        todayKey: wall.todayKey,
        nowMin: wall.nowMin,
      );
      final lessons = professorTodayLessons(items, wall.todayKey);
      if (slot != null) {
        final next = professorNextToday(
          items,
          todayKey: wall.todayKey,
          nowMin: wall.nowMin,
          except: slot.item,
        );
        children.addAll([
          _NowCard(slot: slot, todayKey: wall.todayKey),
          const SizedBox(height: 12),
          _StatsRow(
            stats: professorTodayStats(
              items,
              todayKey: wall.todayKey,
              nowMin: wall.nowMin,
            ),
          ),
          if (next.isNotEmpty) ...[
            const SizedBox(height: 22),
            _SectionTitle(
              'Próximas hoje',
              action: 'Ver agenda',
              actionKey: const Key('professor-today-see-agenda'),
              onAction: () => context.goNamed(AppRouteNames.professorAgenda),
            ),
            const SizedBox(height: 10),
            for (final i in next) ...[
              _NextRow(item: i, nowMin: wall.nowMin),
              const SizedBox(height: 8),
            ],
          ],
        ]);
      } else if (lessons.isEmpty) {
        children.add(
          const ProfessorLinksCard(
            key: Key('professor-home-no-classes'),
            child: _MutedLine('Nenhuma aula sua hoje.'),
          ),
        );
      } else {
        final next = professorNextToday(
          items,
          todayKey: wall.todayKey,
          nowMin: wall.nowMin,
        );
        children.add(_DayCard(lessons: lessons));
        if (next.isNotEmpty) {
          final first = next.first;
          final isFirstOfDay = first.id == lessons.first.id;
          children.addAll([
            const SizedBox(height: 22),
            _SectionTitle(
              '${isFirstOfDay ? 'Primeira aula' : 'Próxima aula'} · '
              '${professorStartsInLabel(first.startMin - wall.nowMin).toLowerCase()}',
            ),
            const SizedBox(height: 10),
            _NextLessonCard(item: first),
          ]);
        }
      }

      if (pendings.isNotEmpty) {
        children.addAll([
          const SizedBox(height: 22),
          _SectionTitle('Precisa de você · ${pendings.length}'),
          const SizedBox(height: 10),
          _PendingsCard(pendings: pendings),
        ]);
      }

      final day = professorDayEntries(
        items,
        dateKey: wall.todayKey,
        todayKey: wall.todayKey,
        nowMin: wall.nowMin,
      );
      if (day.isNotEmpty) {
        children.addAll([
          const SizedBox(height: 22),
          const _SectionTitle('Linha do dia'),
          const SizedBox(height: 12),
          _DayTimeline(entries: day),
        ]);
      }
    }

    return Scaffold(
      backgroundColor: colors.canvas,
      body: NexaPageHeader(
        topGap: 10,
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
        header: _Header(wall: wall.wall),
        child: RefreshIndicator(
          color: AppColors.brand,
          onRefresh: () async {
            ref.invalidate(professorTodayNowProvider);
            ref.invalidate(professorAgendaSessionsProvider(range));
            await ref
                .read(professorAgendaSessionsProvider(range).future)
                .then<void>((_) {}, onError: (_) {});
          },
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: EdgeInsets.fromLTRB(
              20,
              8,
              20,
              professorShellBottomPadding(context),
            ),
            children: [
              ...children,
              const SizedBox(height: 26),
              _BookSection(links: links),
              const SizedBox(height: 26),
              _ArenasSection(
                links: links,
                now: ref.watch(professorTodayNowProvider),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ── cabeçalho ────────────────────────────────────────────────────────────

class _Header extends ConsumerWidget {
  const _Header({required this.wall});

  final DateTime wall;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final firstName = ref.watch(roleSelectionFirstNameProvider);
    final profile = ref.watch(athleteProfileProvider).valueOrNull;
    final unread = ref.watch(athleteUnreadNotificationsCountProvider);
    return Row(
      children: [
        _Avatar(
          initials: profile != null
              ? athleteInitials(profile)
              : (firstName.isEmpty ? '?' : firstName[0].toUpperCase()),
          imageUrl: profile?.avatarUrl,
          onTap: () => showProfessorSettingsSheet(context),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                professorTodayKicker(wall),
                key: const Key('professor-today-kicker'),
                style: ProfessorLinksStyle.mono(
                  10,
                  color: ProfessorLinksStyle.dim(colors),
                ),
              ),
              const SizedBox(height: 2),
              Text(
                '${professorGreeting(wall.hour)}, $firstName',
                key: const Key('professor-today-greeting'),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: ProfessorLinksStyle.display(
                  20,
                  color: colors.onSurface,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(width: 12),
        Stack(
          clipBehavior: Clip.none,
          children: [
            ProfessorLinksRoundButton(
              key: const Key('professor-home-bell'),
              icon: Icons.notifications_outlined,
              semanticLabel: 'Notificações',
              onTap: () =>
                  context.pushNamed(AppRouteNames.athleteNotifications),
            ),
            if (unread > 0)
              Positioned(
                top: 8,
                right: 9,
                child: IgnorePointer(
                  child: Container(
                    key: const Key('professor-home-bell-dot'),
                    width: 9,
                    height: 9,
                    decoration: BoxDecoration(
                      color: AppColors.brand,
                      shape: BoxShape.circle,
                      border: Border.all(color: colors.canvas, width: 2),
                    ),
                  ),
                ),
              ),
          ],
        ),
      ],
    );
  }
}

/// Avatar do professor; o toque abre os ajustes do modo (Minhas arenas,
/// Trocar papel, Sair).
class _Avatar extends StatelessWidget {
  const _Avatar({
    required this.initials,
    required this.imageUrl,
    required this.onTap,
  });

  final String initials;
  final String? imageUrl;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final fallback = ColoredBox(
      color: ProfessorLinksStyle.soft(colors),
      child: Center(
        child: Text(
          initials,
          style: ProfessorLinksStyle.display(14, color: colors.onSurface),
        ),
      ),
    );
    final url = imageUrl;
    return Semantics(
      button: true,
      label: 'Ajustes do modo professor',
      child: GestureDetector(
        key: const Key('professor-home-settings'),
        onTap: onTap,
        child: Container(
          width: 42,
          height: 42,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            border: Border.all(color: ProfessorLinksStyle.line2(colors)),
          ),
          child: ClipOval(
            child: url == null || url.isEmpty
                ? fallback
                : CachedNetworkImage(
                    imageUrl: url,
                    fit: BoxFit.cover,
                    placeholder: (_, __) => fallback,
                    errorWidget: (_, __, ___) => fallback,
                  ),
          ),
        ),
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.text, {this.action, this.actionKey, this.onAction});

  final String text;
  final String? action;
  final Key? actionKey;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        Expanded(child: ProfessorLinksKicker(text)),
        if (action != null)
          GestureDetector(
            key: actionKey,
            onTap: onAction,
            child: Text(
              action!,
              style: ProfessorLinksStyle.display(
                12,
                weight: FontWeight.w600,
                color: colors.readableTone(AppColors.brand),
              ),
            ),
          ),
      ],
    );
  }
}

// ── "Agora" (J1) ─────────────────────────────────────────────────────────

void _openAttendance(BuildContext context, String sessionId) {
  context.pushNamed(
    AppRouteNames.professorClassAttendance,
    pathParameters: {'sessionId': sessionId},
  );
}

class _NowCard extends ConsumerWidget {
  const _NowCard({required this.slot, required this.todayKey});

  final ProfessorNowSlot slot;
  final String todayKey;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final item = slot.item;
    final palette = ref.watch(professorArenaPaletteProvider);
    final arenaColor = professorItemColor(palette, item);
    final tone = slot.isLive ? AppColors.live : AppColors.brand;
    final planRef = professorItemPlanRef(item);
    final plan = planRef == null
        ? null
        : ref.watch(professorLessonPlanProvider(planRef)).valueOrNull;
    final session = item.session;
    final attendanceCta =
        session == null ? null : professorClassCta(session, todayKey);
    final actions = professorNowActions(
      item: item,
      attendanceCta: attendanceCta,
      plan: plan,
      canPlan: planRef != null,
    );

    void run(ProfessorNowAction a) {
      switch (a) {
        case ProfessorNowAction.attendance:
          _openAttendance(context, session!.sessionId);
        case ProfessorNowAction.startLesson:
          openLessonLive(context, plan!.id);
        case ProfessorNowAction.planLesson:
          openLessonPlanEditor(
            context,
            kind: planRef!.kind,
            refId: planRef.refId,
          );
        case ProfessorNowAction.details:
          openProfessorAgendaItem(context, item);
      }
    }

    String label(ProfessorNowAction a) => switch (a) {
          ProfessorNowAction.attendance => attendanceCta!,
          ProfessorNowAction.startLesson => 'Iniciar aula',
          ProfessorNowAction.planLesson => 'Planejar',
          ProfessorNowAction.details => 'Detalhes',
        };

    return Container(
      key: const Key('professor-today-now'),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(20),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          stops: const [0, 0.58],
          colors: [tone.withValues(alpha: 0.14), colors.surfaceCard],
        ),
        border: Border.all(color: tone.withValues(alpha: 0.32)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Container(
                width: 7,
                height: 7,
                decoration: BoxDecoration(
                  color: tone,
                  shape: BoxShape.circle,
                  boxShadow: [
                    BoxShadow(
                      color: tone.withValues(alpha: 0.2),
                      spreadRadius: 4,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 9),
              Text(
                slot.label,
                key: const Key('professor-today-now-label'),
                style: ProfessorLinksStyle.mono(
                  9.5,
                  color: colors.readableTone(tone),
                ).copyWith(letterSpacing: 1.1),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  professorItemWhereLabel(item),
                  textAlign: TextAlign.right,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: ProfessorLinksStyle.mono(9.5, color: arenaColor),
                ),
              ),
            ],
          ),
          const SizedBox(height: 11),
          Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: arenaColor.withValues(alpha: 0.16),
                  borderRadius: BorderRadius.circular(12),
                ),
                alignment: Alignment.center,
                child: Text(
                  item.letter,
                  style: ProfessorLinksStyle.display(15, color: arenaColor),
                ),
              ),
              const SizedBox(width: 11),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      item.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: ProfessorLinksStyle.display(
                        16,
                        weight: FontWeight.w700,
                        color: colors.onSurface,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      professorItemSummary(item),
                      key: const Key('professor-today-now-summary'),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
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
          if (slot.isLive) ...[
            const SizedBox(height: 12),
            ClipRRect(
              borderRadius: BorderRadius.circular(2),
              child: LinearProgressIndicator(
                key: const Key('professor-today-now-progress'),
                value: slot.progress,
                minHeight: 4,
                color: tone,
                backgroundColor: ProfessorLinksStyle.line2(colors),
              ),
            ),
          ],
          const SizedBox(height: 12),
          Row(
            children: [
              for (var k = 0; k < actions.length; k++) ...[
                if (k > 0) const SizedBox(width: 8),
                k == 0
                    ? Expanded(
                        child: ProfessorLinksPrimaryButton(
                          key: Key('professor-today-now-${actions[k].name}'),
                          label: label(actions[k]),
                          height: 42,
                          onPressed: () => run(actions[k]),
                        ),
                      )
                    : SizedBox(
                        width: 124,
                        child: ProfessorLinksGhostButton(
                          key: Key('professor-today-now-${actions[k].name}'),
                          label: label(actions[k]),
                          height: 42,
                          onPressed: () => run(actions[k]),
                        ),
                      ),
              ],
            ],
          ),
        ],
      ),
    );
  }
}

class _StatsRow extends StatelessWidget {
  const _StatsRow({required this.stats});

  final ProfessorTodayStats stats;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    Widget tile(String value, String label, Key key) => Expanded(
          child: Container(
            padding: const EdgeInsets.fromLTRB(11, 10, 11, 10),
            decoration: BoxDecoration(
              color: colors.surfaceCard,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: ProfessorLinksStyle.line(colors)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  value,
                  key: key,
                  style: ProfessorLinksStyle.display(
                    15.5,
                    color: colors.onSurface,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  label,
                  style: AppTypography.bodyS.copyWith(
                    fontSize: 10.5,
                    color: ProfessorLinksStyle.dim(colors),
                  ),
                ),
              ],
            ),
          ),
        );
    return Row(
      children: [
        tile(
          '${stats.done}/${stats.total}',
          'aula${stats.total == 1 ? '' : 's'} feita${stats.total == 1 ? '' : 's'}',
          const Key('professor-today-stat-done'),
        ),
        const SizedBox(width: 8),
        tile(
          '${stats.students}',
          'aluno${stats.students == 1 ? '' : 's'} hoje',
          const Key('professor-today-stat-students'),
        ),
      ],
    );
  }
}

/// Faixa da arena à esquerda + conteúdo (Próximas e a próxima aula).
class _ArenaEdgeCard extends StatelessWidget {
  const _ArenaEdgeCard({
    super.key,
    required this.color,
    required this.child,
    required this.onTap,
  });

  final Color color;
  final Widget child;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Material(
      color: colors.surfaceCard,
      borderRadius: BorderRadius.circular(16),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: ProfessorLinksStyle.line(colors)),
          ),
          child: IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Container(width: 3, color: color),
                Expanded(child: child),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _NextRow extends ConsumerWidget {
  const _NextRow({required this.item, required this.nowMin});

  final ProfessorAgendaItem item;
  final int nowMin;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final palette = ref.watch(professorArenaPaletteProvider);
    return _ArenaEdgeCard(
      key: Key('professor-today-next-${item.id}'),
      color: professorItemColor(palette, item),
      onTap: () => openProfessorAgendaItem(context, item),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(11, 10, 12, 10),
        child: Row(
          children: [
            SizedBox(
              width: 58,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    item.startLabel,
                    style:
                        ProfessorLinksStyle.mono(13, color: colors.onSurface),
                  ),
                  Text(
                    professorStartsInLabel(item.startMin - nowMin),
                    style: ProfessorLinksStyle.mono(
                      8.5,
                      color: ProfessorLinksStyle.dim(colors),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 6),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    item.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: ProfessorLinksStyle.display(
                      13.5,
                      weight: FontWeight.w700,
                      color: colors.onSurface,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    _subtitle(item),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.bodyS.copyWith(
                      fontSize: 11,
                      color: ProfessorLinksStyle.dim(colors),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            ProfessorAgendaTypeTag(item.typeLabel),
          ],
        ),
      ),
    );
  }
}

/// "Arena CFC · Quadra 2 · 6 alunos".
String _subtitle(ProfessorAgendaItem i) => [
      if (i.arenaName != null) i.arenaName!,
      if (i.place.isNotEmpty) i.place,
    ].join(' · ');

// ── início do dia (J2) ───────────────────────────────────────────────────

class _DayCard extends ConsumerWidget {
  const _DayCard({required this.lessons});

  final List<ProfessorAgendaItem> lessons;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final palette = ref.watch(professorArenaPaletteProvider);
    final strip = professorDayStrip(lessons);
    final n = lessons.length;
    return Container(
      key: const Key('professor-today-day'),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(20),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          stops: const [0, 0.6],
          colors: [
            AppColors.brand.withValues(alpha: 0.18),
            colors.surfaceCard,
          ],
        ),
        border: Border.all(color: AppColors.brand.withValues(alpha: 0.3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          ProfessorLinksKicker(
            'Seu dia',
            color: colors.readableTone(AppColors.brandHover),
          ),
          const SizedBox(height: 6),
          Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Text(
                '$n aula${n == 1 ? '' : 's'}',
                key: const Key('professor-today-day-count'),
                style: ProfessorLinksStyle.display(
                  28,
                  color: colors.onSurface,
                ),
              ),
              const SizedBox(width: 8),
              Flexible(
                child: Text(
                  professorDayRangeLabel(lessons),
                  key: const Key('professor-today-day-range'),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.bodyS.copyWith(
                    fontSize: 12.5,
                    color: ProfessorLinksStyle.mute(colors),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          SizedBox(
            height: 8,
            child: Row(
              children: [
                for (var h = 0; h < strip.length; h++) ...[
                  if (h > 0) const SizedBox(width: 2),
                  Expanded(
                    child: Container(
                      key: Key(
                        'professor-today-strip-'
                        '${kProfessorDayStripStartHour + h}',
                      ),
                      decoration: BoxDecoration(
                        color: strip[h] == null
                            ? ProfessorLinksStyle.line2(colors)
                            : professorItemColor(palette, strip[h]!),
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 5),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              for (final h in const [
                kProfessorDayStripStartHour,
                14,
                kProfessorDayStripEndHour,
              ])
                Text(
                  '${h.toString().padLeft(2, '0')}H',
                  style: ProfessorLinksStyle.mono(
                    9,
                    color: ProfessorLinksStyle.dim(colors),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 10),
          ProfessorArenaLegend(items: lessons),
        ],
      ),
    );
  }
}

class _NextLessonCard extends ConsumerWidget {
  const _NextLessonCard({required this.item});

  final ProfessorAgendaItem item;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final palette = ref.watch(professorArenaPaletteProvider);
    final color = professorItemColor(palette, item);
    return _ArenaEdgeCard(
      key: Key('professor-today-first-${item.id}'),
      color: color,
      onTap: () => openProfessorAgendaItem(context, item),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.16),
                borderRadius: BorderRadius.circular(12),
              ),
              alignment: Alignment.center,
              child: Text(
                item.letter,
                style: ProfessorLinksStyle.display(15, color: color),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    item.title,
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
                    [
                      item.startLabel,
                      if (_subtitle(item).isNotEmpty) _subtitle(item)
                    ].join(' · '),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
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
              color: ProfessorLinksStyle.dim(colors),
            ),
          ],
        ),
      ),
    );
  }
}

// ── pendências ───────────────────────────────────────────────────────────

class _PendingsCard extends ConsumerWidget {
  const _PendingsCard({required this.pendings});

  final List<ProfessorTodayPending> pendings;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    return Container(
      key: const Key('professor-today-pendings'),
      padding: const EdgeInsets.symmetric(horizontal: 12),
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: ProfessorLinksStyle.line(colors)),
      ),
      child: Column(
        children: [
          for (var i = 0; i < pendings.length; i++)
            _PendingRow(
              pending: pendings[i],
              showDivider: i > 0,
              onTap: () => _openPending(context, ref, pendings[i]),
            ),
        ],
      ),
    );
  }
}

void _openPending(
    BuildContext context, WidgetRef ref, ProfessorTodayPending p) {
  final single = p.count == 1 && p.targetId != null;
  switch (p.kind) {
    case ProfessorTodayPendingKind.attendance:
      _openAttendance(context, p.targetId!);
    case ProfessorTodayPendingKind.privateRequest ||
          ProfessorTodayPendingKind.reschedule:
      context.pushNamed(AppRouteNames.professorAvailability);
    case ProfessorTodayPendingKind.messages:
      context.goNamed(AppRouteNames.professorMessages);
    case ProfessorTodayPendingKind.unplanned:
      context.pushNamed(AppRouteNames.professorLessonPlans);
    case ProfessorTodayPendingKind.review:
      if (single) {
        openLessonReview(context, p.targetId!);
      } else {
        context.pushNamed(AppRouteNames.professorLessonPlans);
      }
    case ProfessorTodayPendingKind.evaluations:
      context.pushNamed(AppRouteNames.professorEvaluations);
    case ProfessorTodayPendingKind.arenaNotice:
      if (single) {
        context.pushNamed(
          AppRouteNames.professorArenaNotice,
          pathParameters: {'noticeId': p.targetId!},
        );
      } else {
        ref.read(professorNoticesArenaTabProvider.notifier).state = true;
        context.pushNamed(AppRouteNames.professorNotices);
      }
  }
}

(IconData, Color) _pendingLook(ProfessorTodayPendingKind k) => switch (k) {
      ProfessorTodayPendingKind.attendance => (
          Icons.fact_check_outlined,
          AppColors.pending,
        ),
      ProfessorTodayPendingKind.privateRequest => (
          Icons.person_add_alt_1_outlined,
          AppColors.brandHover,
        ),
      ProfessorTodayPendingKind.reschedule => (
          Icons.swap_horiz_rounded,
          AppColors.pending,
        ),
      ProfessorTodayPendingKind.messages => (
          Icons.chat_bubble_outline_rounded,
          ProfessorLinksStyle.blue,
        ),
      ProfessorTodayPendingKind.unplanned => (
          Icons.edit_note_rounded,
          AppColors.brandHover,
        ),
      ProfessorTodayPendingKind.review => (
          Icons.task_alt_rounded,
          AppColors.win,
        ),
      ProfessorTodayPendingKind.evaluations => (
          Icons.star_outline_rounded,
          AppColors.brandHover,
        ),
      ProfessorTodayPendingKind.arenaNotice => (
          Icons.campaign_outlined,
          ProfessorLinksStyle.blue,
        ),
    };

class _PendingRow extends StatelessWidget {
  const _PendingRow({
    required this.pending,
    required this.showDivider,
    required this.onTap,
  });

  final ProfessorTodayPending pending;
  final bool showDivider;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final (icon, tint) = _pendingLook(pending.kind);
    final tone = colors.readableTone(tint);
    return InkWell(
      key: Key('professor-today-pending-${pending.kind.name}'),
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 10),
        decoration: BoxDecoration(
          border: showDivider
              ? Border(top: BorderSide(color: ProfessorLinksStyle.line(colors)))
              : null,
        ),
        child: Row(
          children: [
            Container(
              width: 34,
              height: 34,
              decoration: BoxDecoration(
                color: tint.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(11),
              ),
              child: Icon(icon, size: 17, color: tone),
            ),
            const SizedBox(width: 11),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    pending.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: ProfessorLinksStyle.display(
                      13,
                      weight: FontWeight.w600,
                      color: colors.onSurface,
                    ),
                  ),
                  const SizedBox(height: 1),
                  Text(
                    pending.subtitle,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.bodyS.copyWith(
                      fontSize: 11,
                      color: ProfessorLinksStyle.dim(colors),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Container(
              height: 30,
              padding: const EdgeInsets.symmetric(horizontal: 11),
              decoration: BoxDecoration(
                color: ProfessorLinksStyle.soft(colors),
                borderRadius: BorderRadius.circular(9),
                border: Border.all(color: ProfessorLinksStyle.line(colors)),
              ),
              alignment: Alignment.center,
              child: Text(
                pending.cta,
                style: ProfessorLinksStyle.display(
                  12,
                  weight: FontWeight.w600,
                  color: colors.onSurface,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── linha do dia ─────────────────────────────────────────────────────────

class _DayTimeline extends ConsumerWidget {
  const _DayTimeline({required this.entries});

  final List<ProfessorDayEntry> entries;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final palette = ref.watch(professorArenaPaletteProvider);
    final rows = <Widget>[];
    for (var k = 0; k < entries.length; k++) {
      final e = entries[k];
      final last = k == entries.length - 1;
      if (e.isTravel) {
        rows.add(Padding(
          key: Key('professor-today-travel-${e.toArena}'),
          padding: const EdgeInsets.fromLTRB(62, 0, 0, 11),
          child: Text(
            'DESLOCAMENTO · ${e.fromArena} → ${e.toArena}'.toUpperCase(),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: ProfessorLinksStyle.mono(
              9,
              color: ProfessorLinksStyle.dim(colors),
            ),
          ),
        ));
        continue;
      }
      final i = e.item!;
      final done = e.phase == ProfessorAgendaPhase.done;
      final live = e.phase == ProfessorAgendaPhase.live;
      final color = professorItemColor(palette, i);
      final strike = i.canceled ? TextDecoration.lineThrough : null;
      rows.add(Opacity(
        opacity: done || i.canceled ? 0.5 : 1,
        child: InkWell(
          key: Key('professor-today-line-${i.id}'),
          onTap: () => openProfessorAgendaItem(context, i),
          child: IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                SizedBox(
                  width: 40,
                  child: Padding(
                    padding: const EdgeInsets.only(top: 1),
                    child: Text(
                      i.startLabel,
                      style: ProfessorLinksStyle.mono(
                        11.5,
                        color: ProfessorLinksStyle.mute(colors),
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                SizedBox(
                  width: 10,
                  child: Column(
                    children: [
                      const SizedBox(height: 4),
                      Container(
                        width: 9,
                        height: 9,
                        decoration: BoxDecoration(
                          color: color,
                          shape: BoxShape.circle,
                        ),
                      ),
                      if (!last)
                        Expanded(
                          child: Container(
                            width: 1,
                            color: ProfessorLinksStyle.line2(colors),
                          ),
                        ),
                    ],
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.only(bottom: 11),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Flexible(
                              child: Text(
                                i.title,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: ProfessorLinksStyle.display(
                                  13,
                                  weight: FontWeight.w600,
                                  color: colors.onSurface,
                                ).copyWith(decoration: strike),
                              ),
                            ),
                            if (live) ...[
                              const SizedBox(width: 6),
                              Text(
                                'AGORA',
                                style: ProfessorLinksStyle.mono(
                                  9,
                                  color: colors.readableTone(AppColors.live),
                                ),
                              ),
                            ],
                            if (i.canceled) ...[
                              const SizedBox(width: 6),
                              Text(
                                'CANCELADA',
                                style: ProfessorLinksStyle.mono(
                                  9,
                                  color: colors.readableTone(AppColors.live),
                                ),
                              ),
                            ],
                          ],
                        ),
                        const SizedBox(height: 1),
                        Text(
                          [
                            i.typeLabel,
                            if (i.place.isNotEmpty) i.place,
                          ].join(' · '),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: AppTypography.bodyS.copyWith(
                            fontSize: 11,
                            color: ProfessorLinksStyle.dim(colors),
                            decoration: strike,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ));
    }
    return Column(
      key: const Key('professor-today-timeline'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: rows,
    );
  }
}

// ── reservar e vínculos ──────────────────────────────────────────────────

class _BookSection extends StatelessWidget {
  const _BookSection({required this.links});

  final List<ArenaProfessorLink>? links;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final arenas = professorBookableArenas(links ?? const []);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const ProfessorLinksKicker('Reservar quadra como professor'),
        const SizedBox(height: 10),
        if (links != null && arenas.isEmpty)
          const ProfessorLinksCard(
            key: Key('professor-home-no-booking'),
            child: _MutedLine(
              'Nenhuma arena liberou "Reservar quadras" no seu vínculo.',
            ),
          ),
        for (final link in arenas) ...[
          ProfessorLinksCard(
            key: Key('professor-book-${link.arenaId}'),
            onTap: () => context.pushNamed(
              AppRouteNames.arenaSlots,
              pathParameters: {'arenaId': link.arenaId},
            ),
            child: Row(
              children: [
                ProfessorArenaMark(
                  name: link.arenaName,
                  logoUrl: link.arenaLogoUrl,
                  size: 40,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        link.arenaName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: ProfessorLinksStyle.display(
                          15,
                          color: colors.onSurface,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        'Mesmo preço e regras da arena',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 12,
                          color: ProfessorLinksStyle.mute(colors),
                        ),
                      ),
                    ],
                  ),
                ),
                Icon(
                  Icons.chevron_right_rounded,
                  color: ProfessorLinksStyle.dim(colors),
                ),
              ],
            ),
          ),
          const SizedBox(height: 10),
        ],
      ],
    );
  }
}

class _ArenasSection extends StatelessWidget {
  const _ArenasSection({required this.links, required this.now});

  final List<ArenaProfessorLink>? links;
  final DateTime now;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final all = links ?? const <ArenaProfessorLink>[];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const ProfessorLinksKicker('Vínculos'),
        const SizedBox(height: 10),
        ProfessorLinksCard(
          key: const Key('professor-home-my-arenas'),
          onTap: () => context.pushNamed(AppRouteNames.professorArenas),
          child: Row(
            children: [
              Icon(Icons.school_outlined, color: colors.onSurface),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Minhas arenas',
                      style: ProfessorLinksStyle.display(
                        15,
                        color: colors.onSurface,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      professorLinksEntrySubtitle(all, now),
                      style: TextStyle(
                        fontSize: 12,
                        color: ProfessorLinksStyle.mute(colors),
                      ),
                    ),
                  ],
                ),
              ),
              Icon(
                Icons.chevron_right_rounded,
                color: ProfessorLinksStyle.dim(colors),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _MutedLine extends StatelessWidget {
  const _MutedLine(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: TextStyle(
        fontSize: 13,
        height: 1.4,
        color: ProfessorLinksStyle.mute(context.themeColors),
      ),
    );
  }
}
