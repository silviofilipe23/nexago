import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/layout/nexa_page_header.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../../core/ui/agenda/nexa_agenda.dart';
import '../../../arena/presentation/aulas/widgets/arena_class_atoms.dart';
import '../../../professor_links/application/professor_links_providers.dart';
import '../../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../application/professor_agenda_providers.dart';
import '../../application/professor_wallet_providers.dart';
import '../../domain/professor_agenda.dart';
import '../../domain/professor_lessons.dart';
import '../../domain/professor_students_logic.dart' show professorShortDate;
import '../../domain/professor_wallet_logic.dart' show professorMonthName;
import '../../infrastructure/professor_students_repository.dart';
import '../actions/professor_action_widgets.dart' show ProfessorActionHint;
import '../professor_shell_page.dart';
import '../wallet/professor_wallet_lessons.dart' show startProfessorLesson;
import '../widgets/professor_students_widgets.dart';
import 'professor_agenda_widgets.dart';

const _weekdayShort = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

String _weekday(String dateKey) =>
    _weekdayShort[DateTime.parse(dateKey).weekday - 1];

/// Aba Agenda do modo Professor (E1 Dia · E2 Semana · E3 Mês): aulas de
/// turma, da carteira e os bloqueios, com a cor de cada arena. Carrega só
/// o intervalo da visão (a semana ou o mês).
class ProfessorAgendaPage extends ConsumerWidget {
  const ProfessorAgendaPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final view = ref.watch(professorAgendaViewProvider);
    final date = ref.watch(professorAgendaSelectedDateProvider);
    final now = ref.watch(professorAgendaNowProvider);
    final range = professorAgendaRange(view, date);
    final async = ref.watch(professorAgendaItemsProvider(range));
    final items = async.valueOrNull;

    void setDate(String key) =>
        ref.read(professorAgendaDateProvider.notifier).state = key;
    void setView(ProfessorAgendaView v) =>
        ref.read(professorAgendaViewProvider.notifier).state = v;

    return Scaffold(
      backgroundColor: colors.canvas,
      body: NexaPageHeader(
        topGap: 10,
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
        header: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Agenda',
                    style: ProfessorLinksStyle.display(
                      24,
                      color: colors.onSurface,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    _subtitle(view, date, range, items),
                    key: const Key('professor-agenda-subtitle'),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: ProfessorLinksStyle.mono(
                      10.5,
                      color: ProfessorLinksStyle.dim(colors),
                    ).copyWith(letterSpacing: 0.8),
                  ),
                ],
              ),
            ),
            ProfessorLinksRoundButton(
              key: const Key('professor-agenda-sync'),
              icon: Icons.event_repeat_rounded,
              semanticLabel: 'Sincronizar calendário',
              onTap: () =>
                  context.pushNamed(AppRouteNames.professorCalendarSync),
            ),
            const SizedBox(width: 8),
            ProfessorLinksRoundButton(
              key: const Key('professor-agenda-add'),
              icon: Icons.add_rounded,
              filled: true,
              semanticLabel: 'Bloquear período ou nova aula',
              onTap: () => showProfessorAgendaAddSheet(context, ref),
            ),
          ],
        ),
        child: RefreshIndicator(
          color: AppColors.brand,
          onRefresh: () async {
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
              ArenaClassSegmented<ProfessorAgendaView>(
                items: const [
                  (ProfessorAgendaView.day, 'Dia'),
                  (ProfessorAgendaView.week, 'Semana'),
                  (ProfessorAgendaView.month, 'Mês'),
                ],
                selected: view,
                onChanged: setView,
              ),
              const SizedBox(height: 12),
              NexaAgendaPeriodNav(
                keyPrefix: 'professor-agenda',
                label: _periodLabel(view, date, range),
                isCurrent: _containsToday(view, date, now.todayKey),
                onPrev: () => setDate(view == ProfessorAgendaView.month
                    ? professorShiftMonth(date, -1)
                    : professorShiftDay(date, -7)),
                onNext: () => setDate(view == ProfessorAgendaView.month
                    ? professorShiftMonth(date, 1)
                    : professorShiftDay(date, 7)),
                onToday: () =>
                    ref.read(professorAgendaDateProvider.notifier).state = null,
              ),
              const SizedBox(height: 12),
              if (items == null && async.hasError)
                ProfessorRetryCard(
                  message: async.error is ProfessorStudentsException
                      ? (async.error as ProfessorStudentsException).message
                      : 'Não foi possível carregar sua agenda.',
                  onRetry: () =>
                      ref.invalidate(professorAgendaSessionsProvider(range)),
                )
              else if (items == null)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 40),
                  child: Center(
                    child: CircularProgressIndicator(color: AppColors.brand),
                  ),
                )
              else ...[
                if (professorAgendaConflicts(items) case final c
                    when c.isNotEmpty) ...[
                  ProfessorConflictBanner(conflicts: c),
                  const SizedBox(height: 12),
                ],
                switch (view) {
                  ProfessorAgendaView.day => _DayView(
                      items: items,
                      date: date,
                      onPick: setDate,
                    ),
                  ProfessorAgendaView.week => _WeekView(
                      items: items,
                      date: date,
                      onPickDay: (d) {
                        setDate(d);
                        setView(ProfessorAgendaView.day);
                      },
                    ),
                  ProfessorAgendaView.month => _MonthView(
                      items: items,
                      date: date,
                      onPickDay: (d) {
                        setDate(d);
                        setView(ProfessorAgendaView.day);
                      },
                    ),
                },
              ],
            ],
          ),
        ),
      ),
    );
  }

  static bool _containsToday(
    ProfessorAgendaView view,
    String date,
    String todayKey,
  ) {
    final r = professorAgendaRange(view, date);
    return todayKey.compareTo(r.fromKey) >= 0 &&
        todayKey.compareTo(r.toKey) <= 0;
  }

  static String _periodLabel(
    ProfessorAgendaView view,
    String date,
    ProfessorAgendaRange r,
  ) {
    if (view == ProfessorAgendaView.month) {
      final m = professorMonthName(date.substring(0, 7));
      return '${m[0].toUpperCase()}${m.substring(1)} ${date.substring(0, 4)}';
    }
    return '${professorShortDate(r.fromKey)} – ${professorShortDate(r.toKey)}';
  }

  static String _subtitle(
    ProfessorAgendaView view,
    String date,
    ProfessorAgendaRange r,
    List<ProfessorAgendaItem>? items,
  ) {
    String count(int n) => '$n AULA${n == 1 ? '' : 'S'}';
    final all = items ?? const [];
    switch (view) {
      case ProfessorAgendaView.day:
        final n = professorLessonCountOn(all, date);
        final arenas = {
          for (final i in professorItemsOn(all, date))
            if (!i.isBlock && !i.canceled) i.arenaId,
        }.length;
        return [
          '${_weekday(date)}, ${professorShortDate(date)}'.toUpperCase(),
          if (items != null) count(n),
          if (arenas > 1) '$arenas ARENAS',
        ].join(' · ');
      case ProfessorAgendaView.week:
        final n = all.where((i) => !i.isBlock && !i.canceled).length;
        return [
          '${professorShortDate(r.fromKey)}–${professorShortDate(r.toKey)}'
              .toUpperCase(),
          if (items != null) count(n),
        ].join(' · ');
      case ProfessorAgendaView.month:
        final s = professorMonthSummary(all, date.substring(0, 7));
        return [
          '${professorMonthName(date.substring(0, 7))} ${date.substring(0, 4)}'
              .toUpperCase(),
          if (items != null) count(s.lessons),
        ].join(' · ');
    }
  }
}

// ── E1 Dia ───────────────────────────────────────────────────────────────

class _DayView extends ConsumerWidget {
  const _DayView({
    required this.items,
    required this.date,
    required this.onPick,
  });

  final List<ProfessorAgendaItem> items;
  final String date;
  final ValueChanged<String> onPick;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final now = ref.watch(professorAgendaNowProvider);
    final palette = ref.watch(professorArenaPaletteProvider);
    final entries = professorDayEntries(
      items,
      dateKey: date,
      todayKey: now.todayKey,
      nowMin: now.nowMin,
    );
    final days = professorWeekDays(date);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        NexaAgendaDayStrip(
          keyPrefix: 'professor-agenda',
          days: days,
          selected: date,
          todayKey: now.todayKey,
          countOf: (d) => professorLessonCountOn(items, d),
          onPick: onPick,
        ),
        const SizedBox(height: 12),
        ProfessorArenaLegend(items: professorItemsOn(items, date)),
        const SizedBox(height: 10),
        if (entries.isEmpty)
          const ProfessorLinksCard(
            key: Key('professor-agenda-day-empty'),
            child: ProfessorMutedText('Nenhuma aula neste dia.'),
          ),
        for (final e in entries)
          if (e.isTravel)
            Padding(
              key: Key('professor-agenda-travel-${e.toArena}'),
              padding: const EdgeInsets.fromLTRB(56, 4, 0, 4),
              child: Row(
                children: [
                  Expanded(
                    child: Divider(color: ProfessorLinksStyle.line2(colors)),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    'DESLOCAMENTO · ${e.fromArena} → ${e.toArena}'
                        .toUpperCase(),
                    style: ProfessorLinksStyle.mono(
                      9.5,
                      color: ProfessorLinksStyle.dim(colors),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Divider(color: ProfessorLinksStyle.line2(colors)),
                  ),
                ],
              ),
            )
          else
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 5),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SizedBox(
                    width: 44,
                    child: Padding(
                      padding: const EdgeInsets.only(top: 12),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            e.item!.startLabel,
                            style: ProfessorLinksStyle.mono(
                              13,
                              color: colors.onSurface,
                            ),
                          ),
                          Text(
                            e.item!.endLabel,
                            style: ProfessorLinksStyle.mono(
                              9.5,
                              color: ProfessorLinksStyle.dim(colors),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: ProfessorAgendaCard(
                      key: Key('professor-agenda-item-${e.item!.id}'),
                      item: e.item!,
                      color: professorItemColor(palette, e.item!),
                      live: e.phase == ProfessorAgendaPhase.live,
                      dimmed: e.phase == ProfessorAgendaPhase.done,
                      onTap: () => openProfessorAgendaItem(context, e.item!),
                    ),
                  ),
                ],
              ),
            ),
      ],
    );
  }
}

// ── E2 Semana ────────────────────────────────────────────────────────────

class _WeekView extends ConsumerWidget {
  const _WeekView({
    required this.items,
    required this.date,
    required this.onPickDay,
  });

  final List<ProfessorAgendaItem> items;
  final String date;
  final ValueChanged<String> onPickDay;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final now = ref.watch(professorAgendaNowProvider);
    final palette = ref.watch(professorArenaPaletteProvider);
    final days = professorWeekDays(date);
    final byId = {for (final i in items) i.id: i};
    return NexaAgendaWeekGrid(
      keyPrefix: 'professor-agenda',
      days: days,
      todayKey: now.todayKey,
      nowMin: now.nowMin,
      blocks: [
        for (final d in days)
          for (final i in professorItemsOn(items, d))
            NexaAgendaBlock(
              id: i.id,
              date: d,
              startMin: i.startMin,
              endMin: i.endMin,
              color: professorItemColor(palette, i),
              letter: i.letter,
              semanticLabel: '${i.typeLabel} ${i.title} ${i.startLabel}',
              faded: i.canceled,
              hatched: i.isBlock,
            ),
      ],
      onPickDay: onPickDay,
      onOpen: (id) {
        final i = byId[id];
        if (i != null) openProfessorAgendaItem(context, i);
      },
      footer: [
        Wrap(
          spacing: 10,
          runSpacing: 4,
          children: [
            for (final (k, l) in const [
              ('T', 'Turma'),
              ('P', 'Particular'),
              ('D', 'Dupla'),
              ('E', 'Experimental'),
              ('R', 'Reposição'),
              ('B', 'Bloqueio'),
            ])
              Text.rich(
                TextSpan(children: [
                  TextSpan(
                    text: '$k ',
                    style: ProfessorLinksStyle.mono(
                      10,
                      color: ProfessorLinksStyle.mute(colors),
                    ),
                  ),
                  TextSpan(text: l),
                ]),
                style: AppTypography.bodyS.copyWith(
                  fontSize: 10.5,
                  color: ProfessorLinksStyle.dim(colors),
                ),
              ),
          ],
        ),
        ProfessorArenaLegend(items: items),
      ],
    );
  }
}

// ── E3 Mês ───────────────────────────────────────────────────────────────

class _MonthView extends ConsumerWidget {
  const _MonthView({
    required this.items,
    required this.date,
    required this.onPickDay,
  });

  final List<ProfessorAgendaItem> items;
  final String date;
  final ValueChanged<String> onPickDay;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final todayKey = ref.watch(professorAgendaNowProvider).todayKey;
    final grid = professorMonthGrid(date);
    final blocked = professorBlockedDays(items);
    final summary = professorMonthSummary(items, date.substring(0, 7));
    return NexaAgendaMonthGrid(
      keyPrefix: 'professor-agenda',
      days: grid.days,
      leading: grid.leading,
      todayKey: todayKey,
      countOf: (d) => professorLessonCountOn(items, d),
      isBlocked: blocked.contains,
      onPickDay: onPickDay,
      footer: [
        NexaAgendaStats(
          stats: [
            (
              value: '${summary.lessons}',
              label: 'aulas',
              key: const Key('professor-agenda-month-lessons'),
              color: null,
            ),
            (
              value: summary.hoursLabel,
              label: 'em quadra',
              key: const Key('professor-agenda-month-hours'),
              color: null,
            ),
            (
              value: '${summary.blockedDays}',
              label:
                  'dia${summary.blockedDays == 1 ? '' : 's'} bloqueado'
                  '${summary.blockedDays == 1 ? '' : 's'}',
              key: const Key('professor-agenda-month-blocked'),
              color: summary.blockedDays > 0 ? AppColors.live : null,
            ),
          ],
        ),
        ProfessorArenaLegend(items: items),
      ],
    );
  }
}

// ── "+" ──────────────────────────────────────────────────────────────────

/// "+" da Agenda: bloquear período, comunicado e, para o independente,
/// "Nova aula" para um aluno da carteira (o fluxo da fase 4).
Future<void> showProfessorAgendaAddSheet(
  BuildContext context,
  WidgetRef ref,
) {
  return showProfessorLinksSheet<void>(
    context,
    builder: (sheetContext) => Consumer(
      builder: (context, ref, _) {
        final colors = context.themeColors;
        final independent = ref.watch(professorHasIndependentLinkProvider);
        final students = [
          for (final s
              in ref.watch(professorWalletStudentsProvider).valueOrNull ??
                  const [])
            if (s.active) s,
        ];
        final links = ref.watch(myProfessorLinksProvider).valueOrNull;
        final arenas = links == null ? null : professorLessonArenas(links);
        final canLesson = students.isNotEmpty && (arenas?.isNotEmpty ?? false);

        Widget option({
          required Key key,
          required IconData icon,
          required String title,
          required String subtitle,
          VoidCallback? onTap,
        }) =>
            ProfessorLinksCard(
              key: key,
              onTap: onTap,
              child: Opacity(
                opacity: onTap == null ? 0.5 : 1,
                child: Row(
                  children: [
                    Icon(icon, color: AppColors.brand),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            title,
                            style: ProfessorLinksStyle.display(
                              14,
                              weight: FontWeight.w700,
                              color: colors.onSurface,
                            ),
                          ),
                          const SizedBox(height: 2),
                          ProfessorMutedText(subtitle),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            );

        return ProfessorLinksSheetBody(
          title: 'Adicionar à agenda',
          children: [
            const SizedBox(height: 14),
            option(
              key: const Key('professor-agenda-add-block'),
              icon: Icons.block_rounded,
              title: 'Bloquear período',
              subtitle: 'Folga, torneio, viagem ou saúde',
              onTap: () {
                Navigator.of(sheetContext).pop();
                context.pushNamed(AppRouteNames.professorBlockNew);
              },
            ),
            const SizedBox(height: 10),
            option(
              key: const Key('professor-agenda-add-notice'),
              icon: Icons.campaign_outlined,
              title: 'Comunicado',
              subtitle: 'Aviso, enquete ou cancelamento para seus alunos',
              onTap: () {
                Navigator.of(sheetContext).pop();
                context.pushNamed(AppRouteNames.professorNoticeNew);
              },
            ),
            if (independent) ...[
              const SizedBox(height: 10),
              option(
                key: const Key('professor-agenda-add-lesson'),
                icon: Icons.event_available_outlined,
                title: 'Nova aula',
                subtitle: 'Para um aluno da sua carteira · você reserva a '
                    'quadra',
                onTap: canLesson
                    ? () async {
                        final athleteId = await _pickStudent(
                          sheetContext,
                          [for (final s in students) (s.athleteId, s.name)],
                        );
                        if (athleteId == null || !context.mounted) return;
                        if (sheetContext.mounted) {
                          Navigator.of(sheetContext).pop();
                        }
                        await startProfessorLesson(
                          context,
                          ref,
                          athleteId: athleteId,
                          arenas: arenas!,
                        );
                      }
                    : null,
              ),
              if (!canLesson) ...[
                const SizedBox(height: 6),
                ProfessorActionHint(
                  students.isEmpty
                      ? 'Adicione alunos à carteira em Mais › Carteira própria.'
                      : 'Peça a uma arena um vínculo independente com '
                          '"Reservar quadras".',
                ),
              ],
            ],
          ],
        );
      },
    ),
  );
}

Future<String?> _pickStudent(
  BuildContext context,
  List<(String, String)> students,
) =>
    showProfessorLinksSheet<String>(
      context,
      builder: (sheetContext) => ProfessorLinksSheetBody(
        title: 'Aula para quem?',
        children: [
          for (final (id, name) in students) ...[
            const SizedBox(height: 8),
            ProfessorLinksCard(
              key: Key('professor-agenda-pick-$id'),
              onTap: () => Navigator.of(sheetContext).pop(id),
              child: Text(
                name,
                style: ProfessorLinksStyle.display(
                  14,
                  weight: FontWeight.w600,
                  color: sheetContext.themeColors.onSurface,
                ),
              ),
            ),
          ],
        ],
      ),
    );
