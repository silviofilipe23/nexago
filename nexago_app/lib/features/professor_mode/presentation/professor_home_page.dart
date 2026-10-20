import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/layout/nexa_page_header.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../athlete/domain/agenda/class_agenda_entry.dart';
import '../../auth/domain/role_selection_providers.dart';
import '../../professor_links/application/professor_links_providers.dart';
import '../../professor_links/domain/arena_professor_link.dart';
import '../../professor_links/domain/professor_link_rules.dart';
import '../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../application/professor_mode_providers.dart';
import '../domain/professor_mode_logic.dart';
import 'widgets/professor_settings_sheet.dart';

/// Home do modo Professor (papel `professor`): as aulas de hoje com a chamada,
/// a chamada que ficou pendente, as próximas aulas, onde reservar quadra como
/// professor e Minhas arenas. Tudo vem do que o servidor já entrega
/// (`getMyClassAgenda` e os vínculos); quem autoriza é sempre o vínculo.
class ProfessorHomePage extends ConsumerWidget {
  const ProfessorHomePage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final firstName = ref.watch(roleSelectionFirstNameProvider);
    final now = ref.watch(professorLinksClockProvider)();
    final classesAsync = ref.watch(professorClassesProvider);
    final links = ref.watch(myProfessorLinksProvider).valueOrNull;

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
                  const ProfessorLinksKicker('Modo professor'),
                  const SizedBox(height: 4),
                  Text(
                    'Olá, $firstName',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: ProfessorLinksStyle.display(
                      24,
                      color: colors.onSurface,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 12),
            ProfessorLinksRoundButton(
              key: const Key('professor-home-settings'),
              icon: Icons.settings_outlined,
              semanticLabel: 'Ajustes do modo professor',
              onTap: () => showProfessorSettingsSheet(context),
            ),
          ],
        ),
        child: RefreshIndicator(
          color: AppColors.brand,
          onRefresh: () async {
            ref.invalidate(professorClassesProvider);
            await ref.read(professorClassesProvider.future).catchError(
                  (_) => const <ClassAgendaEntry>[],
                );
          },
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
            children: [
              _ClassesSection(classesAsync: classesAsync, now: now),
              const SizedBox(height: 26),
              _BookSection(links: links),
              const SizedBox(height: 26),
              _ArenasSection(links: links, now: now),
            ],
          ),
        ),
      ),
    );
  }
}

final _weekday = DateFormat('EEE', 'pt_BR');
final _month = DateFormat('MMM', 'pt_BR');

/// pt_BR abrevia com ponto ("ter.", "out.") — no rótulo fica sem.
String _abbr(DateFormat format, DateTime day) =>
    format.format(day).replaceAll('.', '');

/// "ter, 20 de out".
String _dayLabel(DateTime day) =>
    '${_abbr(_weekday, day)}, ${day.day} de ${_abbr(_month, day)}';

/// "ter, 20/10".
String _shortDayLabel(DateTime day) =>
    '${_abbr(_weekday, day)}, ${day.day.toString().padLeft(2, '0')}/'
    '${day.month.toString().padLeft(2, '0')}';

DateTime? _parseDateKey(String key) =>
    key.length >= 10 ? DateTime.tryParse(key.substring(0, 10)) : null;

class _ClassesSection extends ConsumerWidget {
  const _ClassesSection({required this.classesAsync, required this.now});

  final AsyncValue<List<ClassAgendaEntry>> classesAsync;
  final DateTime now;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final todayKey = professorDateKey(now);
    final entries = classesAsync.valueOrNull;
    final children = <Widget>[
      ProfessorLinksKicker('Hoje · ${_dayLabel(now)}'),
      const SizedBox(height: 10),
    ];
    if (entries == null) {
      children.add(
        classesAsync.hasError
            ? ProfessorLinksCard(
                onTap: () => ref.invalidate(professorClassesProvider),
                child: const _MutedLine(
                  'Não foi possível carregar suas aulas. Toque para tentar de novo.',
                ),
              )
            : const Padding(
                padding: EdgeInsets.symmetric(vertical: 20),
                child: Center(
                  child: CircularProgressIndicator(color: AppColors.brand),
                ),
              ),
      );
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: children,
      );
    }

    final today = professorClassesOn(entries, todayKey);
    final pending = professorPendingAttendance(entries, todayKey);
    final upcoming = professorUpcomingClasses(entries, now);
    if (today.isEmpty) {
      children.add(
        const ProfessorLinksCard(
          key: Key('professor-home-no-classes'),
          child: _MutedLine('Nenhuma aula sua hoje.'),
        ),
      );
    } else {
      for (final e in today) {
        children
          ..add(_ClassCard(entry: e, todayKey: todayKey))
          ..add(const SizedBox(height: 10));
      }
    }
    if (pending.isNotEmpty) {
      children.addAll([
        const SizedBox(height: 16),
        const ProfessorLinksKicker(
          'Chamada pendente',
          color: AppColors.pending,
        ),
        const SizedBox(height: 10),
        for (final e in pending) ...[
          _ClassCard(entry: e, todayKey: todayKey, showDate: true),
          const SizedBox(height: 10),
        ],
      ]);
    }
    if (upcoming.isNotEmpty) {
      children.addAll([
        const SizedBox(height: 16),
        const ProfessorLinksKicker('Próximas aulas'),
        const SizedBox(height: 10),
        ProfessorLinksCard(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
          child: Column(
            children: [
              for (var i = 0; i < upcoming.length; i++)
                _UpcomingRow(
                  entry: upcoming[i],
                  todayKey: todayKey,
                  showDivider: i < upcoming.length - 1,
                ),
            ],
          ),
        ),
      ]);
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: children,
    );
  }
}

void _openAttendance(BuildContext context, ClassAgendaEntry e) {
  context.pushNamed(
    AppRouteNames.professorClassAttendance,
    pathParameters: {'sessionId': e.sessionId},
  );
}

class _ClassCard extends StatelessWidget {
  const _ClassCard({
    required this.entry,
    required this.todayKey,
    this.showDate = false,
  });

  final ClassAgendaEntry entry;
  final String todayKey;
  final bool showDate;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final cta = professorClassCta(entry, todayKey);
    final day = _parseDateKey(entry.date);
    final time = '${entry.startTime}–${entry.endTime}';
    final status = entry.isCanceled
        ? ('CANCELADA', AppColors.live)
        : entry.status == 'completed'
            ? ('CHAMADA FEITA', AppColors.win)
            : null;
    return ProfessorLinksCard(
      key: Key('professor-class-${entry.sessionId}'),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  showDate && day != null
                      ? '${_shortDayLabel(day)} · $time'
                      : time,
                  style: ProfessorLinksStyle.mono(
                    12,
                    color: ProfessorLinksStyle.mute(colors),
                  ),
                ),
              ),
              if (status != null)
                Text(
                  status.$1,
                  style: ProfessorLinksStyle.mono(10.5, color: status.$2),
                ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            entry.className,
            style: ProfessorLinksStyle.display(
              17,
              color: colors.onSurface,
            ).copyWith(
              decoration: entry.isCanceled ? TextDecoration.lineThrough : null,
            ),
          ),
          const SizedBox(height: 3),
          Text(
            professorClassSubtitle(entry),
            style: TextStyle(
              fontSize: 13,
              color: ProfessorLinksStyle.mute(colors),
            ),
          ),
          if (cta != null) ...[
            const SizedBox(height: 14),
            cta == 'Fazer chamada'
                ? ProfessorLinksPrimaryButton(
                    key: Key('professor-class-cta-${entry.sessionId}'),
                    label: cta,
                    height: 46,
                    onPressed: () => _openAttendance(context, entry),
                  )
                : ProfessorLinksGhostButton(
                    key: Key('professor-class-cta-${entry.sessionId}'),
                    label: cta,
                    height: 44,
                    onPressed: () => _openAttendance(context, entry),
                  ),
          ] else if (!entry.isCanceled && !entry.canManageLessons) ...[
            const SizedBox(height: 10),
            const _MutedLine(
              'A arena não liberou a chamada pelo app no seu vínculo.',
            ),
          ],
        ],
      ),
    );
  }
}

class _UpcomingRow extends StatelessWidget {
  const _UpcomingRow({
    required this.entry,
    required this.todayKey,
    required this.showDivider,
  });

  final ClassAgendaEntry entry;
  final String todayKey;
  final bool showDivider;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final day = _parseDateKey(entry.date);
    final cta = professorClassCta(entry, todayKey);
    return InkWell(
      key: Key('professor-upcoming-${entry.sessionId}'),
      onTap: cta == null ? null : () => _openAttendance(context, entry),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: BoxDecoration(
          border: showDivider
              ? Border(
                  bottom: BorderSide(color: ProfessorLinksStyle.line(colors)),
                )
              : null,
        ),
        child: Row(
          children: [
            SizedBox(
              width: 92,
              child: Text(
                [
                  if (day != null) _shortDayLabel(day),
                  entry.startTime,
                ].join('\n'),
                style: ProfessorLinksStyle.mono(
                  11,
                  color: ProfessorLinksStyle.mute(colors),
                ),
              ),
            ),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    entry.className,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: ProfessorLinksStyle.display(
                      14,
                      color: colors.onSurface,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    professorClassSubtitle(entry),
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
            if (cta != null)
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
