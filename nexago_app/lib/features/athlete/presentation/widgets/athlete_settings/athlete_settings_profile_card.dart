import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../domain/sand_rank/sand_rank_providers.dart';
import '../../sand_rank/widgets/sand_rank_emblem.dart';
import 'athlete_settings_helpers.dart';

class AthleteSettingsProfileCard extends ConsumerWidget {
  const AthleteSettingsProfileCard({
    super.key,
    required this.name,
    required this.email,
    required this.onEdit,
    this.secondaryName,
    this.avatarUrl,
    this.isLoading = false,
  });

  final String name;
  final String? secondaryName;
  final String? email;
  final String? avatarUrl;
  final VoidCallback? onEdit;
  final bool isLoading;

  static const double _avatarSize = 52;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final initials = athleteInitialsFromName(name);
    final emailLine = email?.trim();

    return DecoratedBox(
      decoration: BoxDecoration(
        color: context.themeColors.surfaceCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        child: Row(
          children: [
            _SettingsProfileAvatar(
              size: _avatarSize,
              avatarUrl: avatarUrl,
              initials: initials,
              isLoading: isLoading,
            ),
            SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    isLoading ? 'Carregando…' : name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w800,
                      color: context.themeColors.onSurface,
                      letterSpacing: -0.2,
                    ),
                  ),
                  if (secondaryName != null) ...[
                    SizedBox(height: 2),
                    Text(
                      secondaryName!,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: context.themeColors.onSurfaceMuted,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                  if (emailLine != null && emailLine.isNotEmpty) ...[
                    SizedBox(height: 4),
                    Text(
                      emailLine,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: context.themeColors.onSurfaceMuted,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ],
              ),
            ),
            TextButton(
              onPressed: isLoading ? null : onEdit,
              style: TextButton.styleFrom(
                foregroundColor: AppColors.brand,
                padding: const EdgeInsets.symmetric(horizontal: 8),
                minimumSize: Size.zero,
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              ),
              child: Text(
                'EDITAR',
                style: AppTypography.mono(
                  fontSize: 10,
                  fontWeight: FontWeight.w800,
                  color: AppColors.brand,
                  letterSpacing: 0.6,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SettingsProfileAvatar extends ConsumerWidget {
  const _SettingsProfileAvatar({
    required this.size,
    required this.avatarUrl,
    required this.initials,
    required this.isLoading,
  });

  final double size;
  final String? avatarUrl;
  final String initials;
  final bool isLoading;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final url = avatarUrl?.trim();
    const emblemSlot = 14.0;

    return SizedBox(
      width: size + emblemSlot,
      height: size + emblemSlot,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Positioned(
            left: 0,
            top: 0,
            child: Container(
              width: size,
              height: size,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(
                  color: AppColors.brand.withValues(alpha: 0.5),
                  width: 1.5,
                ),
              ),
              child: ClipOval(
                child: SizedBox(
                  width: size,
                  height: size,
                  child: isLoading
                      ? ColoredBox(
                          color: context.themeColors.surfaceRaised,
                          child: Center(
                            child: SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: AppColors.brand,
                              ),
                            ),
                          ),
                        )
                      : url != null && url.isNotEmpty
                          ? CachedNetworkImage(
                              imageUrl: url,
                              width: size,
                              height: size,
                              fit: BoxFit.cover,
                              placeholder: (_, __) => _InitialsBadge(
                                initials: initials,
                                theme: theme,
                              ),
                              errorWidget: (_, __, ___) => _InitialsBadge(
                                initials: initials,
                                theme: theme,
                              ),
                            )
                          : _InitialsBadge(
                              initials: initials,
                              theme: theme,
                            ),
                ),
              ),
            ),
          ),
          Positioned(
            right: 0,
            bottom: 0,
            child: Consumer(
              builder: (context, ref, _) {
                final enabled =
                    ref.watch(sandRankEnabledProvider).valueOrNull ?? false;
                if (!enabled) return const SizedBox.shrink();

                final progress = ref.watch(sandRankProgressProvider);
                return SandRankStepEmblem(
                  step: progress.current,
                  size: SandRankEmblemSize.badge,
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _InitialsBadge extends StatelessWidget {
  const _InitialsBadge({
    required this.initials,
    required this.theme,
  });

  final String initials;
  final ThemeData theme;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0xFFCC0000), Color(0xFFFF6A1A)],
        ),
      ),
      child: Center(
        child: Text(
          initials,
          style: theme.textTheme.titleMedium?.copyWith(
            fontWeight: FontWeight.w900,
            color: AppColors.black,
            letterSpacing: -0.5,
          ),
        ),
      ),
    );
  }
}
