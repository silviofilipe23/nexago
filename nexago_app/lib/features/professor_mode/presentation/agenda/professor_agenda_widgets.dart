import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/ui/agenda/nexa_agenda.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../arena/presentation/aulas/widgets/arena_class_atoms.dart';
import '../../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../application/professor_agenda_providers.dart';
import '../../domain/professor_agenda.dart';
import '../../domain/professor_students_logic.dart' show professorShortDate;
import '../../domain/professor_actions_logic.dart' show professorDayLabel;

/// Peças da Agenda do professor (protótipo `pa-app-agenda.jsx`, E1–E8).

/// Paleta das arenas ([kProfessorArenaPaletteSize] cores; laranja e azul
/// primeiro, como no desenho).
const List<Color> kProfessorArenaColors = [
  Color(0xFFFF8A4A),
  Color(0xFF5B9BFF),
  Color(0xFF34C77B),
  Color(0xFFA879FF),
  Color(0xFFFF6FA8),
  Color(0xFF2EC4C4),
  Color(0xFFF5B83D),
  Color(0xFF9BD64A),
];

/// Vermelho do bloqueio.
const Color kProfessorBlockColor = AppColors.live;

Color professorArenaColor(Map<String, int> palette, String? arenaId) {
  if (arenaId == null) return kProfessorBlockColor;
  final i = palette[arenaId] ?? professorArenaPalette([arenaId])[arenaId] ?? 0;
  return kProfessorArenaColors[i % kProfessorArenaColors.length];
}

/// Particular do app: sem arena, laranja.
Color professorItemColor(Map<String, int> palette, ProfessorAgendaItem i) =>
    i.isBlock
        ? kProfessorBlockColor
        : i.kind == ProfessorAgendaKind.privateLesson
            ? AppColors.brandHover
            : professorArenaColor(palette, i.arenaId);

/// Abre o detalhe do item: turma (E4), particular (E5), o bloqueio (E7),
/// para a particular do app a Disponibilidade (pedidos e próximas) e, na
/// turma própria, o detalhe da turma.
void openProfessorAgendaItem(BuildContext context, ProfessorAgendaItem i) {
  switch (i.kind) {
    case ProfessorAgendaKind.session:
      context.pushNamed(
        AppRouteNames.professorAgendaSession,
        pathParameters: {'sessionId': i.session!.sessionId},
        extra: i.session,
      );
    case ProfessorAgendaKind.lesson:
      context.pushNamed(
        AppRouteNames.professorAgendaLesson,
        pathParameters: {'bookingId': i.lesson!.bookingId},
      );
    case ProfessorAgendaKind.block:
      context.pushNamed(
        AppRouteNames.professorBlockEdit,
        pathParameters: {'blockId': i.block!.id},
      );
    case ProfessorAgendaKind.privateLesson:
      context.pushNamed(AppRouteNames.professorAvailability);
    case ProfessorAgendaKind.ownClass:
      final classId = i.ownClassId;
      if (classId == null) return;
      context.pushNamed(
        AppRouteNames.professorOwnClass,
        pathParameters: {'classId': classId},
      );
  }
}

/// "Turma", "Particular"… (o bloqueio em vermelho).
class ProfessorAgendaTypeTag extends StatelessWidget {
  const ProfessorAgendaTypeTag(this.label, {super.key});

  final String label;

  @override
  Widget build(BuildContext context) {
    final color = switch (label) {
      'Bloqueio' => kProfessorBlockColor,
      'Particular' => AppColors.brandHover,
      'Dupla' || kProfessorOwnClassTypeLabel => ProfessorLinksStyle.blue,
      'Experimental' || 'Reposição' => AppColors.pending,
      _ => context.themeColors.onSurface,
    };
    return ArenaClassTag(label: label, color: color);
  }
}

/// Legenda das arenas (bolinha + nome).
class ProfessorArenaLegend extends ConsumerWidget {
  const ProfessorArenaLegend({super.key, required this.items});

  final List<ProfessorAgendaItem> items;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final palette = ref.watch(professorArenaPaletteProvider);
    final arenas = <String, String>{};
    var hasBlock = false;
    for (final i in items) {
      if (i.isBlock) {
        hasBlock = true;
      } else if (i.arenaId != null) {
        arenas[i.arenaId!] = i.arenaName ?? 'Arena';
      }
    }
    if (arenas.isEmpty && !hasBlock) return const SizedBox.shrink();
    Widget dot(Color c, String label, Key key) => Row(
          key: key,
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 8,
              height: 8,
              decoration: BoxDecoration(color: c, shape: BoxShape.circle),
            ),
            const SizedBox(width: 6),
            Text(
              label,
              style: AppTypography.bodyS.copyWith(
                fontSize: 11,
                color: ProfessorLinksStyle.mute(context.themeColors),
              ),
            ),
          ],
        );
    return Wrap(
      spacing: 14,
      runSpacing: 6,
      children: [
        for (final e in arenas.entries)
          dot(professorArenaColor(palette, e.key), e.value,
              Key('professor-agenda-legend-${e.key}')),
        if (hasBlock)
          dot(kProfessorBlockColor, 'Bloqueio',
              const Key('professor-agenda-legend-block')),
      ],
    );
  }
}

/// Listras diagonais do bloqueio (Semana e Mês) — a do componente da agenda.
typedef ProfessorHatchPainter = NexaHatchPainter;

/// "Qui 22 · 07:00–08:00".
String professorAgendaWhen(ProfessorAgendaItem i, String todayKey) =>
    '${professorDayLabel(i.date, todayKey)} · ${i.startLabel}–${i.endLabel}';

/// Aviso de conflitos do intervalo (E6) — toque abre a folha.
class ProfessorConflictBanner extends StatelessWidget {
  const ProfessorConflictBanner({super.key, required this.conflicts});

  final List<ProfessorAgendaConflict> conflicts;

  @override
  Widget build(BuildContext context) {
    final n = conflicts.length;
    return GestureDetector(
      key: const Key('professor-agenda-conflicts'),
      onTap: () => showProfessorConflictsSheet(context, conflicts),
      child: ProfessorLinksNote(
        '$n conflito${n == 1 ? '' : 's'} de horário neste período. Toque para '
        'ver.',
        tone: ProfessorLinksNoteTone.red,
      ),
    );
  }
}

/// E6: os dois itens de cada conflito, com atalho para abrir cada um. Sem
/// resolução automática — o professor decide e avisa.
Future<void> showProfessorConflictsSheet(
  BuildContext context,
  List<ProfessorAgendaConflict> conflicts,
) =>
    showProfessorLinksSheet<void>(
      context,
      builder: (sheetContext) => Consumer(
        builder: (context, ref, _) {
          final palette = ref.watch(professorArenaPaletteProvider);
          final todayKey = ref.watch(professorAgendaNowProvider).todayKey;
          return ProfessorLinksSheetBody(
            title: 'Conflito de horário',
            subtitle: 'Abra cada um para remarcar, cancelar ou avisar.',
            children: [
              for (final c in conflicts) ...[
                const SizedBox(height: 14),
                Text(
                  '${professorDayLabel(c.date, todayKey)} '
                  '${professorShortDate(c.date)} · '
                  '${professorMinutesLabel(c.startMin)}–'
                  '${professorMinutesLabel(c.endMin)}',
                  style: ProfessorLinksStyle.mono(
                    10.5,
                    color: kProfessorBlockColor,
                  ),
                ),
                for (final i in [c.first, c.second]) ...[
                  const SizedBox(height: 8),
                  ProfessorAgendaCard(
                    key: Key('professor-conflict-${i.id}'),
                    item: i,
                    color: professorItemColor(palette, i),
                    onTap: () {
                      Navigator.of(sheetContext).pop();
                      openProfessorAgendaItem(context, i);
                    },
                  ),
                ],
              ],
              const SizedBox(height: 14),
              const ProfessorLinksNote(
                'Arenas diferentes no mesmo horário, ou aula dentro de um '
                'bloqueio. Nada muda sozinho.',
              ),
            ],
          );
        },
      ),
    );

/// Cartão do item (Dia, conflito, aulas afetadas): borda na cor da arena.
class ProfessorAgendaCard extends StatelessWidget {
  const ProfessorAgendaCard({
    super.key,
    required this.item,
    required this.color,
    this.onTap,
    this.live = false,
    this.dimmed = false,
  });

  final ProfessorAgendaItem item;
  final Color color;
  final VoidCallback? onTap;
  final bool live;
  final bool dimmed;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final i = item;
    final strike = i.canceled ? TextDecoration.lineThrough : null;
    return Opacity(
      opacity: dimmed ? 0.5 : 1,
      child: Material(
        color:
            live ? AppColors.live.withValues(alpha: 0.07) : colors.surfaceCard,
        borderRadius: BorderRadius.circular(16),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Container(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: _edge(colors)),
            ),
            // Borda com raio só aceita cor única: a faixa da arena é um
            // filho à esquerda.
            child: IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Container(width: 3, color: color),
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(11, 11, 13, 11),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              ProfessorAgendaTypeTag(i.typeLabel),
                              if (live) ...[
                                const SizedBox(width: 6),
                                Text(
                                  'AGORA',
                                  style: ProfessorLinksStyle.mono(9,
                                      color: AppColors.live),
                                ),
                              ],
                              if (i.canceled) ...[
                                const SizedBox(width: 6),
                                Text(
                                  'CANCELADA',
                                  style: ProfessorLinksStyle.mono(9,
                                      color: AppColors.live),
                                ),
                              ],
                              const Spacer(),
                              if (i.arenaName != null)
                                Flexible(
                                  child: Text(
                                    i.arenaName!.toUpperCase(),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: ProfessorLinksStyle.mono(9.5,
                                        color: color),
                                  ),
                                ),
                            ],
                          ),
                          const SizedBox(height: 6),
                          Text(
                            i.title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: ProfessorLinksStyle.display(
                              14,
                              weight: FontWeight.w700,
                              color: colors.onSurface,
                            ).copyWith(decoration: strike),
                          ),
                          if (i.place.isNotEmpty) ...[
                            const SizedBox(height: 2),
                            Text(
                              i.place,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: AppTypography.bodyS.copyWith(
                                fontSize: 11.5,
                                color: ProfessorLinksStyle.dim(colors),
                                decoration: strike,
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Color _edge(AppThemeColors colors) => live
      ? AppColors.live.withValues(alpha: 0.35)
      : ProfessorLinksStyle.line(colors);
}
