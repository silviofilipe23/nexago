import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../application/professor_student_profile_providers.dart';

/// I1 · Card "Perfil público de atleta" na página do aluno (B3/B4): prévia
/// com nível, jogos, torneios e ranking — o mesmo que qualquer visitante vê.
class ProfessorStudentProfileEntry extends ConsumerWidget {
  const ProfessorStudentProfileEntry({
    super.key,
    required this.athleteId,
    required this.onOpen,
  });

  final String athleteId;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final preview =
        ref.watch(professorStudentProfilePreviewProvider(athleteId)).valueOrNull;
    final restricted = preview?.restricted ?? false;
    final subtitle = preview?.subtitle ?? 'Jogos, torneios e ranking';
    return ProfessorLinksCard(
      key: const Key('professor-student-public-profile'),
      padding: const EdgeInsets.all(12),
      backgroundColor: ProfessorLinksStyle.soft(colors),
      borderColor: restricted
          ? ProfessorLinksStyle.line2(colors)
          : AppColors.brand.withValues(alpha: 0.4),
      onTap: onOpen,
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: restricted
                  ? ProfessorLinksStyle.soft(colors)
                  : AppColors.brand.withValues(alpha: 0.14),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(
              restricted
                  ? Icons.lock_outline_rounded
                  : Icons.emoji_events_outlined,
              size: 19,
              color: restricted
                  ? ProfessorLinksStyle.mute(colors)
                  : colors.brandText,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Perfil público de atleta',
                  style: ProfessorLinksStyle.display(
                    13.5,
                    color: colors.onSurface,
                    weight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  key: const Key('professor-student-public-profile-preview'),
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
          const SizedBox(width: 8),
          Icon(
            Icons.chevron_right_rounded,
            size: 18,
            color: restricted ? ProfessorLinksStyle.dim(colors) : colors.brandText,
          ),
        ],
      ),
    );
  }
}
