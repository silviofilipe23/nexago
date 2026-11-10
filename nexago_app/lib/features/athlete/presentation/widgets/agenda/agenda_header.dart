import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

class AgendaHeader extends StatelessWidget {
  const AgendaHeader({
    super.key,
    required this.eyebrow,
    required this.title,
    required this.monthModeActive,
    required this.unreadNotificationCount,
    required this.searchVisible,
    required this.onSearchTap,
    required this.onCalendarTap,
    required this.onNotificationsTap,
    this.waitlistActiveCount = 0,
    this.waitlistHasOffer = false,
    this.onWaitlistTap,
    this.leading,
  });

  final String eyebrow;
  final String title;
  final bool monthModeActive;
  final int unreadNotificationCount;
  final bool searchVisible;
  final VoidCallback onSearchTap;
  final VoidCallback onCalendarTap;
  final VoidCallback onNotificationsTap;

  /// Filas de espera ativas (aguardando + vaga liberada): o número da ampulheta.
  final int waitlistActiveCount;

  /// Vaga liberada para o atleta: a ampulheta fica verde.
  final bool waitlistHasOffer;

  /// Abre "Listas de espera"; null esconde a ampulheta.
  final VoidCallback? onWaitlistTap;

  /// À esquerda do título. Ex.: o botão da conta do atleta.
  final Widget? leading;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Padding(
      padding: EdgeInsets.fromLTRB(leading == null ? 20 : 12, 8, 12, 4),
      child: Row(
        crossAxisAlignment: leading == null
            ? CrossAxisAlignment.start
            : CrossAxisAlignment.center,
        children: [
          if (leading case final leading?) ...[
            leading,
            const SizedBox(width: 10),
          ],
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  eyebrow,
                  style: AppTypography.mono(
                    fontSize: 11,
                    color: context.themeColors.onSurfaceMuted,
                    fontWeight: FontWeight.w500,
                    letterSpacing: 0.3,
                  ),
                ),
                Text(
                  title,
                  style: theme.textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.w900,
                    color: context.themeColors.onSurface,
                    letterSpacing: -0.4,
                  ),
                ),
              ],
            ),
          ),
          // SizedBox(width: 4),
          // _HeaderIconButton(
          //   icon: Icons.search_rounded,
          //   tooltip: searchVisible ? 'Fechar busca' : 'Buscar na agenda',
          //   active: searchVisible,
          //   onTap: onSearchTap,
          // ),
          if (onWaitlistTap case final onWaitlistTap?) ...[
            SizedBox(width: 4),
            _WaitlistButton(
              activeCount: waitlistActiveCount,
              hasOffer: waitlistHasOffer,
              onTap: onWaitlistTap,
            ),
          ],
          SizedBox(width: 4),
          _HeaderIconButton(
            icon: Icons.calendar_month_rounded,
            tooltip: monthModeActive ? 'Visão do dia' : 'Visão do mês',
            active: monthModeActive,
            onTap: onCalendarTap,
          ),
          SizedBox(width: 4),
          Stack(
            clipBehavior: Clip.none,
            children: [
              _HeaderIconButton(
                icon: Icons.notifications_outlined,
                tooltip: 'Notificações',
                onTap: onNotificationsTap,
              ),
              if (unreadNotificationCount > 0)
                Positioned(
                  right: 6,
                  top: 6,
                  child: Container(
                    width: 8,
                    height: 8,
                    decoration: BoxDecoration(
                      color: context.themeColors.live,
                      shape: BoxShape.circle,
                      border: Border.all(
                        color: context.themeColors.canvas,
                        width: 1.5,
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class AgendaSearchField extends StatelessWidget {
  const AgendaSearchField({
    super.key,
    required this.controller,
    required this.onChanged,
  });

  final TextEditingController controller;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 4),
      child: TextField(
        controller: controller,
        onChanged: onChanged,
        decoration: InputDecoration(
          hintText: 'Buscar na agenda…',
          prefixIcon: const Icon(Icons.search_rounded, size: 20),
          filled: true,
          fillColor: context.themeColors.surfaceCard,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: BorderSide(color: context.themeColors.surfaceRaised),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: BorderSide(color: context.themeColors.surfaceRaised),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: const BorderSide(color: AppColors.brand, width: 1.5),
          ),
          contentPadding: const EdgeInsets.symmetric(
            horizontal: 14,
            vertical: 12,
          ),
        ),
        style: theme.textTheme.bodyMedium,
      ),
    );
  }
}

class _HeaderIconButton extends StatelessWidget {
  const _HeaderIconButton({
    required this.icon,
    required this.tooltip,
    required this.onTap,
    this.active = false,
  });

  final IconData icon;
  final String tooltip;
  final VoidCallback onTap;
  final bool active;

  @override
  Widget build(BuildContext context) {
    return IconButton(
      tooltip: tooltip,
      onPressed: onTap,
      style: IconButton.styleFrom(
        foregroundColor: active
            ? AppColors.brand
            : context.themeColors.onSurfaceMuted,
        side: active
            ? const BorderSide(color: AppColors.brand, width: 1.5)
            : BorderSide(color: context.themeColors.surfaceRaised),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
      icon: Icon(icon, size: 22),
    );
  }
}

/// Ampulheta das listas de espera: número de filas ativas; verde com vaga liberada.
class _WaitlistButton extends StatelessWidget {
  const _WaitlistButton({
    required this.activeCount,
    required this.hasOffer,
    required this.onTap,
  });

  final int activeCount;
  final bool hasOffer;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final badgeColor = hasOffer ? colors.win : AppColors.brand;
    return Stack(
      clipBehavior: Clip.none,
      children: [
        IconButton(
          key: const ValueKey('agenda-waitlist-button'),
          tooltip: hasOffer
              ? 'Listas de espera · vaga liberada'
              : 'Listas de espera',
          onPressed: onTap,
          style: IconButton.styleFrom(
            foregroundColor: hasOffer ? colors.win : colors.onSurfaceMuted,
            backgroundColor:
                hasOffer ? AppColors.win.withValues(alpha: 0.08) : null,
            side: hasOffer
                ? BorderSide(color: colors.win, width: 1.5)
                : BorderSide(color: colors.surfaceRaised),
            shape:
                RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
          icon: const Icon(Icons.hourglass_top_rounded, size: 22),
        ),
        if (activeCount > 0)
          Positioned(
            right: -2,
            top: -2,
            child: Container(
              key: const ValueKey('agenda-waitlist-badge'),
              constraints: const BoxConstraints(minWidth: 18),
              height: 18,
              padding: const EdgeInsets.symmetric(horizontal: 5),
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: badgeColor,
                borderRadius: BorderRadius.circular(9),
                border: Border.all(color: colors.canvas, width: 2),
              ),
              child: Text(
                activeCount > 9 ? '9+' : '$activeCount',
                style: AppTypography.mono(
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                  color: AppColors.black,
                ),
              ),
            ),
          ),
      ],
    );
  }
}
