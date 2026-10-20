import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../application/professor_links_providers.dart';
import '../../domain/arena_professor_link.dart';
import 'professor_links_ui.dart';

/// Seção "Professores" da página da arena: vínculos ativos com "Aparecer no
/// perfil da arena" (espelho público `publicProfessors`). Não renderiza nada
/// quando a arena não exibe ninguém.
class ArenaPublicProfessorsSection extends ConsumerWidget {
  const ArenaPublicProfessorsSection({super.key, required this.arenaId});

  final String arenaId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final professors =
        ref.watch(arenaPublicProfessorsProvider(arenaId)).valueOrNull ??
            const <PublicArenaProfessor>[];
    if (professors.isEmpty) return const SizedBox.shrink();

    final theme = Theme.of(context);
    return Column(
      key: const Key('arena-public-professors'),
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 28),
        Text(
          'Professores',
          style: theme.textTheme.titleMedium?.copyWith(
            fontWeight: FontWeight.w800,
            color: context.themeColors.onSurface,
            letterSpacing: -0.3,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          'Dão aula nesta arena.',
          style: theme.textTheme.bodySmall?.copyWith(
            color: context.themeColors.onSurfaceMuted,
          ),
        ),
        const SizedBox(height: 12),
        for (var i = 0; i < professors.length; i++) ...[
          if (i > 0) const SizedBox(height: 10),
          _ProfessorRow(professor: professors[i]),
        ],
      ],
    );
  }
}

class _ProfessorRow extends StatelessWidget {
  const _ProfessorRow({required this.professor});

  final PublicArenaProfessor professor;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.themeColors;
    final modalities = professor.modalities.isEmpty
        ? 'Professor'
        : professor.modalities.join(' · ');
    return Material(
      color: Colors.transparent,
      child: InkWell(
        // Perfil público do atleta: o professor é a mesma conta global.
        onTap: () => context.pushNamed(
          AppRouteNames.athleteProfile,
          queryParameters: {'userId': professor.professorUserId},
        ),
        borderRadius: BorderRadius.circular(16),
        child: Ink(
          decoration: BoxDecoration(
            color: colors.surfaceCard,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: colors.onSurfaceMuted.withValues(alpha: 0.12),
            ),
          ),
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(
              children: [
                _ProfessorAvatar(professor: professor),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        professor.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.w800,
                          color: colors.onSurface,
                        ),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        modalities,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: colors.onSurfaceMuted,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                ProfessorLinkTypeTag(professor.type, small: true),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _ProfessorAvatar extends StatelessWidget {
  const _ProfessorAvatar({required this.professor});

  final PublicArenaProfessor professor;

  @override
  Widget build(BuildContext context) {
    final parts = professor.name
        .trim()
        .split(RegExp(r'\s+'))
        .where((p) => p.isNotEmpty)
        .toList();
    final initials = parts.isEmpty
        ? 'P'
        : (parts.length == 1
                ? String.fromCharCode(parts.first.runes.first)
                : String.fromCharCode(parts.first.runes.first) +
                    String.fromCharCode(parts.last.runes.first))
            .toUpperCase();
    final fallback = ColoredBox(
      color: AppColors.brand.withValues(alpha: 0.14),
      child: Center(
        child: Text(
          initials,
          style: ProfessorLinksStyle.display(
            14,
            weight: FontWeight.w700,
            color: AppColors.brand,
          ),
        ),
      ),
    );
    final url = professor.photoUrl;
    return ClipOval(
      child: SizedBox.square(
        dimension: 42,
        child: url == null
            ? fallback
            : CachedNetworkImage(
                imageUrl: url,
                fit: BoxFit.cover,
                placeholder: (_, __) => fallback,
                errorWidget: (_, __, ___) => fallback,
              ),
      ),
    );
  }
}
