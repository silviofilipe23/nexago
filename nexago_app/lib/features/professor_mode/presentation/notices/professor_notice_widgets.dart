import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../../core/time/nexago_event_timezone.dart';
import '../../../arena/domain/aulas/arena_class_logic.dart';
import '../../../arena/presentation/aulas/widgets/arena_class_atoms.dart';
import '../../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../domain/professor_notices.dart';
import '../../domain/professor_students_logic.dart' show professorShortDate;
import '../wallet/professor_wallet_widgets.dart';

/// Peças dos comunicados (protótipo `pa-app-comunicados.jsx`).

Color professorNoticeKindColor(ProfessorNoticeKind k) => switch (k) {
      ProfessorNoticeKind.cancelamento => AppColors.live,
      ProfessorNoticeKind.enquete => ProfessorLinksStyle.blue,
      ProfessorNoticeKind.aviso => AppColors.brand,
      ProfessorNoticeKind.financeiro => AppColors.pending,
    };

class ProfessorNoticeKindTag extends StatelessWidget {
  const ProfessorNoticeKindTag(this.kind, {super.key});

  final ProfessorNoticeKind kind;

  @override
  Widget build(BuildContext context) =>
      ProfessorWalletTag(kind.label, color: professorNoticeKindColor(kind));
}

/// Cores das opções da enquete (na ordem).
const List<Color> kProfessorPollColors = [
  AppColors.win,
  AppColors.live,
  AppColors.pending,
  ProfessorLinksStyle.blue,
  Color(0xFFA879FF),
];

Color professorPollColor(int i) =>
    kProfessorPollColors[i % kProfessorPollColors.length];

/// "Hoje 17:52" / "Seg 19 · 20:10" / "14 out" — parede de SP.
String professorNoticeWhenLabel(DateTime? instant, String todayKey) {
  if (instant == null) return '';
  const days = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
  final w = toNexagoEventLocal(instant);
  final key = '${w.year.toString().padLeft(4, '0')}-'
      '${w.month.toString().padLeft(2, '0')}-'
      '${w.day.toString().padLeft(2, '0')}';
  final time = '${w.hour.toString().padLeft(2, '0')}:'
      '${w.minute.toString().padLeft(2, '0')}';
  if (key == todayKey) return 'Hoje $time';
  final diff = DateTime.parse(key).difference(DateTime.parse(todayKey)).inDays;
  if (diff.abs() <= 6) return '${days[w.weekday - 1]} ${w.day} · $time';
  return professorShortDate(key);
}

/// Conteúdo do comunicado como o aluno vê (F7) — a mesma peça na prévia do
/// editor. [onAnswer] `null` = só leitura.
class ProfessorNoticeContent extends StatelessWidget {
  const ProfessorNoticeContent({
    super.key,
    required this.professorName,
    required this.kind,
    required this.title,
    required this.body,
    this.pollOptions = const [],
    this.selected,
    this.onAnswer,
    this.whenLabel,
    this.preview = false,
    this.busy = false,
  });

  final String professorName;
  final ProfessorNoticeKind kind;
  final String title;
  final String body;
  final List<String> pollOptions;
  final String? selected;
  final ValueChanged<String>? onAnswer;
  final String? whenLabel;
  final bool preview;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (preview) ...[
          Align(
            alignment: Alignment.centerLeft,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: ProfessorLinksStyle.soft(colors),
                borderRadius: BorderRadius.circular(6),
                border: Border.all(color: ProfessorLinksStyle.line2(colors)),
              ),
              child: Text(
                'PRÉVIA · COMO O ALUNO VÊ',
                style: ProfessorLinksStyle.mono(
                  9.5,
                  color: ProfessorLinksStyle.dim(colors),
                ),
              ),
            ),
          ),
          const SizedBox(height: 14),
        ],
        Row(
          children: [
            ArenaClassAvatar(
              initials: arenaClassInitials(professorName),
              size: 40,
            ),
            const SizedBox(width: 11),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    professorName,
                    style: ProfessorLinksStyle.display(
                      13.5,
                      weight: FontWeight.w700,
                      color: colors.onSurface,
                    ),
                  ),
                  Text(
                    [
                      'SEU PROFESSOR',
                      if (whenLabel != null && whenLabel!.isNotEmpty)
                        whenLabel!.toUpperCase(),
                    ].join(' · '),
                    style: ProfessorLinksStyle.mono(
                      10,
                      color: ProfessorLinksStyle.dim(colors),
                    ),
                  ),
                ],
              ),
            ),
            ProfessorNoticeKindTag(kind),
          ],
        ),
        const SizedBox(height: 16),
        Text(
          title.trim().isEmpty ? 'Sem título' : title.trim(),
          key: const Key('professor-notice-content-title'),
          style: ProfessorLinksStyle.display(19, color: colors.onSurface),
        ),
        const SizedBox(height: 8),
        Text(
          body.trim(),
          style: AppTypography.bodyM.copyWith(
            fontSize: 14,
            height: 1.55,
            color: colors.onSurface,
          ),
        ),
        if (kind == ProfessorNoticeKind.enquete && pollOptions.isNotEmpty) ...[
          const SizedBox(height: 16),
          ProfessorLinksCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const ProfessorLinksKicker('Sua resposta'),
                const SizedBox(height: 10),
                for (final o in pollOptions) ...[
                  _PollOption(
                    key: Key('professor-notice-option-$o'),
                    label: o,
                    selected: selected == o,
                    onTap: onAnswer == null || busy ? null : () => onAnswer!(o),
                  ),
                  const SizedBox(height: 6),
                ],
              ],
            ),
          ),
        ],
      ],
    );
  }
}

class _PollOption extends StatelessWidget {
  const _PollOption({
    super.key,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    const on = AppColors.win;
    return Semantics(
      button: true,
      selected: selected,
      child: Material(
        color: selected
            ? on.withValues(alpha: 0.12)
            : ProfessorLinksStyle.soft(colors),
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: onTap,
          child: Container(
            height: 44,
            padding: const EdgeInsets.symmetric(horizontal: 13),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: selected
                    ? on.withValues(alpha: 0.45)
                    : ProfessorLinksStyle.line(colors),
              ),
            ),
            child: Row(
              children: [
                Container(
                  width: 16,
                  height: 16,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    border: Border.all(
                      width: 1.5,
                      color: selected ? on : ProfessorLinksStyle.line2(colors),
                    ),
                  ),
                  child: selected
                      ? Center(
                          child: Container(
                            width: 8,
                            height: 8,
                            decoration: const BoxDecoration(
                              color: on,
                              shape: BoxShape.circle,
                            ),
                          ),
                        )
                      : null,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    label,
                    style: ProfessorLinksStyle.display(
                      13.5,
                      weight: FontWeight.w600,
                      color: selected ? on : colors.onSurface,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Barra empilhada (respostas por opção + o resto apagado).
class ProfessorStackedBar extends StatelessWidget {
  const ProfessorStackedBar(
      {super.key, required this.parts, required this.total});

  /// (valor, cor).
  final List<(int, Color)> parts;
  final int total;

  @override
  Widget build(BuildContext context) {
    final used = parts.fold<int>(0, (s, p) => s + p.$1);
    final rest = (total - used).clamp(0, total);
    return ClipRRect(
      borderRadius: BorderRadius.circular(5),
      child: SizedBox(
        height: 10,
        child: Row(
          children: [
            for (final (v, c) in parts)
              if (v > 0) Expanded(flex: v, child: ColoredBox(color: c)),
            if (rest > 0 || used == 0)
              Expanded(
                flex: rest > 0 ? rest : 1,
                child: ColoredBox(
                  color: ProfessorLinksStyle.soft(context.themeColors),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
