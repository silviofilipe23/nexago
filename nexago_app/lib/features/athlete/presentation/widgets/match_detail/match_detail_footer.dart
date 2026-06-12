import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/ui/app_snackbar.dart';

enum MatchDetailFooterKind { completed, live, scheduled, spectator }

class MatchDetailFooter extends StatelessWidget {
  const MatchDetailFooter({
    super.key,
    required this.kind,
    required this.hideTournamentAction,
    this.onTournament,
    this.onRematch,
    this.onOpponentProfile,
    this.onShare,
  });

  final MatchDetailFooterKind kind;
  final bool hideTournamentAction;
  final VoidCallback? onTournament;
  final VoidCallback? onRematch;
  final VoidCallback? onOpponentProfile;
  final VoidCallback? onShare;

  @override
  Widget build(BuildContext context) {
    return switch (kind) {
      MatchDetailFooterKind.completed => _CompletedFooter(
        hideTournament: hideTournamentAction,
        onTournament: onTournament,
        onRematch: onRematch,
        onOpponentProfile: onOpponentProfile,
      ),
      MatchDetailFooterKind.live => _LiveFooter(onShare: onShare),
      MatchDetailFooterKind.scheduled => const SizedBox.shrink(),
      MatchDetailFooterKind.spectator => _SpectatorFooter(
        hideTournament: hideTournamentAction,
        onTournament: onTournament,
        onShare: onShare,
      ),
    };
  }
}

class _CompletedFooter extends StatelessWidget {
  const _CompletedFooter({
    required this.hideTournament,
    this.onTournament,
    this.onRematch,
    this.onOpponentProfile,
  });

  final bool hideTournament;
  final VoidCallback? onTournament;
  final VoidCallback? onRematch;
  final VoidCallback? onOpponentProfile;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        _FooterActionsRow(
          children: [
            // _OutlineButton(
            //   icon: Icons.refresh_rounded,
            //   label: 'Revanche',
            //   accent: AppColors.brand,
            //   onTap:
            //       onRematch ?? () => showAppSnackBar(context, 'Em breve.'),
            // ),
            // _OutlineButton(
            //   icon: Icons.person_outline_rounded,
            //   label: 'Perfil deles',
            //   onTap:
            //       onOpponentProfile ??
            //       () => showAppSnackBar(context, 'Em breve.'),
            // ),
          ],
        ),
        if (!hideTournament) ...[
          SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: _OutlineButton(
              icon: Icons.emoji_events_outlined,
              label: 'Ir ao torneio',
              onTap: onTournament ?? () {},
            ),
          ),
        ],
      ],
    );
  }
}

class _LiveFooter extends StatelessWidget {
  const _LiveFooter({this.onShare});

  final VoidCallback? onShare;

  @override
  Widget build(BuildContext context) {
    return _FooterActionsRow(
      children: [
        Material(
          color: AppColors.brand,
          borderRadius: BorderRadius.circular(12),
          child: InkWell(
            onTap: () => showAppSnackBar(context, 'Em breve.'),
            borderRadius: BorderRadius.circular(12),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 14),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    Icons.notifications_none_rounded,
                    size: 18,
                    color: AppColors.black,
                  ),
                  SizedBox(width: 8),
                  Text(
                    'Avisar no fim',
                    style: Theme.of(context).textTheme.labelLarge?.copyWith(
                      fontWeight: FontWeight.w800,
                      color: AppColors.black,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
        _OutlineButton(
          icon: Icons.ios_share_rounded,
          label: 'Compartilhar',
          onTap: onShare ?? () => showAppSnackBar(context, 'Em breve.'),
        ),
      ],
    );
  }
}

class _SpectatorFooter extends StatelessWidget {
  const _SpectatorFooter({
    required this.hideTournament,
    this.onTournament,
    this.onShare,
  });

  final bool hideTournament;
  final VoidCallback? onTournament;
  final VoidCallback? onShare;

  @override
  Widget build(BuildContext context) {
    return _FooterActionsRow(
      children: [
        _OutlineButton(
          icon: Icons.ios_share_rounded,
          label: 'Compartilhar',
          onTap: onShare ?? () => showAppSnackBar(context, 'Em breve.'),
        ),
        if (!hideTournament)
          _OutlineButton(
            icon: Icons.emoji_events_outlined,
            label: 'Ir ao torneio',
            onTap: onTournament ?? () {},
          ),
      ],
    );
  }
}

/// Distributes [children] evenly in a row. Do not wrap children in [Expanded].
class _FooterActionsRow extends StatelessWidget {
  const _FooterActionsRow({required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    if (children.isEmpty) return const SizedBox.shrink();
    if (children.length == 1) {
      return SizedBox(width: double.infinity, child: children.single);
    }

    return Row(
      children: [
        for (var i = 0; i < children.length; i++) ...[
          if (i > 0) SizedBox(width: 12),
          Expanded(child: children[i]),
        ],
      ],
    );
  }
}

class _OutlineButton extends StatelessWidget {
  const _OutlineButton({
    required this.icon,
    required this.label,
    required this.onTap,
  }) : accent = null;

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final Color? accent;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final color = accent ?? context.themeColors.onSurface;

    return Material(
      color: context.themeColors.surfaceCard,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: (accent ?? context.themeColors.onSurfaceMuted).withValues(
                alpha: accent != null ? 0.6 : 0.25,
              ),
            ),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 18, color: color),
              SizedBox(width: 8),
              Flexible(
                child: Text(
                  label,
                  style: theme.textTheme.labelLarge?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: color,
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
