import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../domain/organizer_public_profile_logic.dart';

/// Números do cabeçalho: eventos realizados, atletas, nota (só com reputação) e seguidores.
class OrganizerProfileStatsRow extends StatelessWidget {
  const OrganizerProfileStatsRow({super.key, required this.stats});

  final List<OrganizerHeaderStat> stats;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 18, 20, 0),
      child: IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            for (var i = 0; i < stats.length; i++) ...[
              if (i > 0)
                VerticalDivider(
                  width: 17,
                  thickness: 1,
                  color: colors.onSurfaceMuted.withValues(alpha: 0.18),
                ),
              Expanded(child: _Stat(stat: stats[i])),
            ],
          ],
        ),
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.stat});

  final OrganizerHeaderStat stat;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Flexible(
              child: Text(
                stat.value,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppTypography.soraRegular(
                  fontSize: 20,
                  fontWeight: FontWeight.w800,
                  color: colors.onSurface,
                ),
              ),
            ),
            if (stat.isRating) ...[
              const SizedBox(width: 3),
              const Icon(
                Icons.star_rounded,
                size: 16,
                color: AppColors.pending,
              ),
            ],
          ],
        ),
        const SizedBox(height: 2),
        Text(
          stat.label.toUpperCase(),
          maxLines: 2,
          style: AppTypography.mono(
            fontSize: 9,
            fontWeight: FontWeight.w600,
            color: colors.onSurfaceMuted,
            letterSpacing: 0.6,
          ),
        ),
      ],
    );
  }
}

/// Seguir / Mensagem / Compartilhar. Seguir some no próprio perfil; Mensagem só com WhatsApp.
class OrganizerProfileActions extends StatelessWidget {
  const OrganizerProfileActions({
    super.key,
    required this.showFollow,
    required this.isFollowing,
    required this.followBusy,
    required this.onFollow,
    required this.onShare,
    this.onMessage,
  });

  final bool showFollow;
  final bool isFollowing;
  final bool followBusy;
  final VoidCallback onFollow;
  final VoidCallback onShare;

  /// `null` sem WhatsApp público: o botão não aparece.
  final VoidCallback? onMessage;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final shape = RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(12),
    );
    final outlinedStyle = OutlinedButton.styleFrom(
      foregroundColor: colors.onSurface,
      side: BorderSide(color: colors.onSurfaceMuted.withValues(alpha: 0.3)),
      shape: shape,
      minimumSize: const Size(0, 44),
      padding: const EdgeInsets.symmetric(horizontal: 12),
    );
    final labelStyle = AppTypography.soraRegular(
      fontSize: 14,
      fontWeight: FontWeight.w700,
    );

    final follow = !showFollow
        ? null
        : isFollowing
        ? OutlinedButton.icon(
            key: const ValueKey('organizer-follow-button'),
            onPressed: followBusy ? null : onFollow,
            style: outlinedStyle,
            icon: const Icon(Icons.check_rounded, size: 18),
            label: Text('Seguindo', style: labelStyle),
          )
        : FilledButton.icon(
            key: const ValueKey('organizer-follow-button'),
            onPressed: followBusy ? null : onFollow,
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.brand,
              foregroundColor: AppColors.black,
              shape: shape,
              minimumSize: const Size(0, 44),
            ),
            icon: const Icon(Icons.add_rounded, size: 18),
            label: Text('Seguir', style: labelStyle),
          );

    final message = onMessage == null
        ? null
        : OutlinedButton.icon(
            onPressed: onMessage,
            style: outlinedStyle,
            icon: const Icon(Icons.chat_bubble_outline_rounded, size: 17),
            label: Text('Mensagem', style: labelStyle),
          );

    final share = follow == null && message == null
        ? OutlinedButton.icon(
            onPressed: onShare,
            style: outlinedStyle,
            icon: const Icon(Icons.ios_share_rounded, size: 17),
            label: Text('Compartilhar', style: labelStyle),
          )
        : SizedBox(
            width: 44,
            height: 44,
            child: OutlinedButton(
              onPressed: onShare,
              style: outlinedStyle.copyWith(
                padding: const WidgetStatePropertyAll(EdgeInsets.zero),
              ),
              child: const Icon(
                Icons.ios_share_rounded,
                size: 18,
                semanticLabel: 'Compartilhar',
              ),
            ),
          );

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 18, 20, 0),
      child: Row(
        children: [
          if (follow != null) Expanded(child: follow),
          if (message != null) ...[
            if (follow != null) const SizedBox(width: 10),
            Expanded(child: message),
          ],
          if (follow != null || message != null) ...[
            const SizedBox(width: 10),
            share,
          ] else
            Expanded(child: share),
        ],
      ),
    );
  }
}

class OrganizerSportChips extends StatelessWidget {
  const OrganizerSportChips({super.key, required this.sports});

  final List<String> sports;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 14, 20, 0),
      child: Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          for (final sport in sports)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                color: colors.surfaceRaised,
                borderRadius: BorderRadius.circular(999),
                border: Border.all(
                  color: colors.onSurfaceMuted.withValues(alpha: 0.18),
                ),
              ),
              child: Text(
                organizerSportLabel(sport),
                style: AppTypography.soraRegular(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: colors.onSurface,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

enum OrganizerProfileTab { overview, events, results, reviews }

/// Abas em chips roláveis: quatro rótulos não cabem lado a lado em 360 pt.
class OrganizerProfileTabBar extends StatelessWidget {
  const OrganizerProfileTabBar({
    super.key,
    required this.selected,
    required this.onChanged,
    required this.eventsCount,
  });

  final OrganizerProfileTab selected;
  final ValueChanged<OrganizerProfileTab> onChanged;
  final int eventsCount;

  @override
  Widget build(BuildContext context) {
    String label(OrganizerProfileTab tab) => switch (tab) {
      OrganizerProfileTab.overview => 'Visão geral',
      OrganizerProfileTab.events =>
        eventsCount > 0 ? 'Eventos $eventsCount' : 'Eventos',
      OrganizerProfileTab.results => 'Resultados',
      OrganizerProfileTab.reviews => 'Avaliações',
    };

    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.fromLTRB(20, 22, 20, 0),
      child: Row(
        children: [
          for (final tab in OrganizerProfileTab.values) ...[
            if (tab != OrganizerProfileTab.overview) const SizedBox(width: 8),
            _TabChip(
              label: label(tab),
              selected: tab == selected,
              onTap: () => onChanged(tab),
            ),
          ],
        ],
      ),
    );
  }
}

class _TabChip extends StatelessWidget {
  const _TabChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Semantics(
      selected: selected,
      button: true,
      child: Material(
        color: selected ? colors.onSurface : colors.surfaceCard,
        borderRadius: BorderRadius.circular(999),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(999),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            child: Text(
              label,
              style: AppTypography.soraRegular(
                fontSize: 13,
                fontWeight: FontWeight.w700,
                color: selected ? colors.canvas : colors.onSurfaceMuted,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
