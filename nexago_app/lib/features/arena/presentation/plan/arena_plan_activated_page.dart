import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../arenas/presentation/widgets/booking_success/booking_success_confetti.dart';
import '../../domain/arena_plan.dart';

class ArenaPlanActivatedArgs {
  const ArenaPlanActivatedArgs({
    required this.arenaId,
    required this.tier,
  });

  final String arenaId;
  final ArenaPlanTier tier;
}

/// Celebração após confirmação do pagamento da assinatura (Pro / Parceiro).
class ArenaPlanActivatedPage extends StatelessWidget {
  const ArenaPlanActivatedPage({super.key, required this.args});

  final ArenaPlanActivatedArgs args;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final content = arenaPlanActivationContent(args.tier);
    final accent = _accentForTier(args.tier, colors);
    final statusBarHeight = MediaQuery.paddingOf(context).top;
    final bottomInset = MediaQuery.paddingOf(context).bottom;

    return Scaffold(
      backgroundColor: colors.canvas,
      body: Stack(
        children: [
          Positioned(
            top: -80,
            left: 0,
            right: 0,
            child: Container(
              height: 240,
              decoration: BoxDecoration(
                gradient: RadialGradient(
                  center: Alignment.topCenter,
                  radius: 1.2,
                  colors: [
                    accent.withValues(alpha: 0.14),
                    Colors.transparent,
                  ],
                ),
              ),
            ),
          ),
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            height: statusBarHeight + 280,
            child: IgnorePointer(
              child: BookingSuccessConfetti(statusBarHeight: statusBarHeight),
            ),
          ),
          SafeArea(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Expanded(
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.fromLTRB(24, 24, 24, 16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const SizedBox(height: 8),
                        _ActivationHero(accent: accent),
                        const SizedBox(height: 28),
                        _ActivationTitle(
                          content: content,
                          accent: accent,
                          colors: colors,
                        ),
                        const SizedBox(height: 10),
                        Text(
                          content.subtitle,
                          textAlign: TextAlign.center,
                          style: AppTypography.soraRegular(
                            fontSize: 15,
                            fontWeight: FontWeight.w500,
                            color: colors.onSurfaceMuted,
                            height: 1.45,
                          ),
                        ),
                        const SizedBox(height: 28),
                        _HighlightsCard(
                          highlights: content.highlights,
                          tier: args.tier,
                          colors: colors,
                        ),
                      ],
                    ),
                  ),
                ),
                Padding(
                  padding: EdgeInsets.fromLTRB(20, 0, 20, 12 + bottomInset),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      SizedBox(
                        height: 54,
                        child: FilledButton(
                          onPressed: () =>
                              context.go(AppRoutes.arenaDashboard),
                          style: FilledButton.styleFrom(
                            backgroundColor: colors.brand,
                            foregroundColor: colors.black,
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(14),
                            ),
                          ),
                          child: Text(
                            'Começar a usar →',
                            style: AppTypography.soraRegular(
                              fontSize: 16,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(height: 8),
                      TextButton(
                        onPressed: () => context.go(AppRoutes.arenaPlan),
                        child: Text(
                          'Ver detalhes do plano',
                          style: AppTypography.soraRegular(
                            fontSize: 15,
                            fontWeight: FontWeight.w700,
                            color: colors.onSurfaceMuted,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  static Color _accentForTier(ArenaPlanTier tier, AppThemeColors colors) {
    return switch (tier) {
      ArenaPlanTier.parceiro => AppColors.pending,
      ArenaPlanTier.pro => colors.brand,
      ArenaPlanTier.essencial => colors.onSurfaceMuted,
    };
  }
}

class _ActivationHero extends StatelessWidget {
  const _ActivationHero({required this.accent});

  final Color accent;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Stack(
        alignment: Alignment.center,
        children: [
          Container(
            width: 120,
            height: 120,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              boxShadow: [
                BoxShadow(
                  color: accent.withValues(alpha: 0.45),
                  blurRadius: 40,
                  spreadRadius: 6,
                ),
              ],
            ),
          ),
          Container(
            width: 96,
            height: 96,
            decoration: BoxDecoration(
              color: accent,
              shape: BoxShape.circle,
            ),
            child: const Icon(
              Icons.check_rounded,
              size: 52,
              color: AppColors.black,
            ),
          ),
        ],
      ),
    );
  }
}

class _ActivationTitle extends StatelessWidget {
  const _ActivationTitle({
    required this.content,
    required this.accent,
    required this.colors,
  });

  final ArenaPlanActivationContent content;
  final Color accent;
  final AppThemeColors colors;

  @override
  Widget build(BuildContext context) {
    final plan = arenaPlanByTier(content.tier);
    final planName = plan?.name ?? content.tier.id;
    final prefix = 'Plano ';
    final suffix = ' ativado!';

    return RichText(
      textAlign: TextAlign.center,
      text: TextSpan(
        style: AppTypography.soraRegular(
          fontSize: 26,
          fontWeight: FontWeight.w900,
          color: colors.onSurface,
          letterSpacing: -0.5,
          height: 1.15,
        ),
        children: [
          TextSpan(text: prefix),
          TextSpan(text: planName, style: TextStyle(color: accent)),
          TextSpan(text: suffix),
        ],
      ),
    );
  }
}

class _HighlightsCard extends StatelessWidget {
  const _HighlightsCard({
    required this.highlights,
    required this.tier,
    required this.colors,
  });

  final List<ArenaPlanActivationHighlight> highlights;
  final ArenaPlanTier tier;
  final AppThemeColors colors;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: colors.onSurfaceMuted.withValues(alpha: 0.12),
        ),
      ),
      child: Column(
        children: [
          for (var i = 0; i < highlights.length; i++) ...[
            if (i > 0)
              Divider(
                height: 1,
                thickness: 1,
                color: colors.onSurfaceMuted.withValues(alpha: 0.1),
              ),
            _HighlightRow(
              highlight: highlights[i],
              icon: _iconForHighlight(tier, i),
              colors: colors,
              onTap: highlights[i].routeName == null
                  ? null
                  : () => context.goNamed(highlights[i].routeName!),
            ),
          ],
        ],
      ),
    );
  }

  static IconData _iconForHighlight(ArenaPlanTier tier, int index) {
    if (tier == ArenaPlanTier.pro) {
      return switch (index) {
        0 => Icons.bolt_rounded,
        1 => Icons.bar_chart_rounded,
        _ => Icons.emoji_events_rounded,
      };
    }
    return switch (index) {
      0 => Icons.stadium_rounded,
      1 => Icons.emoji_events_rounded,
      _ => Icons.support_agent_rounded,
    };
  }
}

class _HighlightRow extends StatelessWidget {
  const _HighlightRow({
    required this.highlight,
    required this.icon,
    required this.colors,
    this.onTap,
  });

  final ArenaPlanActivationHighlight highlight;
  final IconData icon;
  final AppThemeColors colors;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          child: Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: colors.surfaceRaised,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(icon, size: 20, color: colors.brand),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      highlight.title,
                      style: AppTypography.soraRegular(
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                        color: colors.onSurface,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      highlight.subtitle,
                      style: AppTypography.soraRegular(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: AppColors.win,
                      ),
                    ),
                  ],
                ),
              ),
              if (onTap != null)
                Icon(
                  Icons.chevron_right_rounded,
                  color: colors.onSurfaceMuted,
                  size: 22,
                ),
            ],
          ),
        ),
      ),
    );
  }
}
