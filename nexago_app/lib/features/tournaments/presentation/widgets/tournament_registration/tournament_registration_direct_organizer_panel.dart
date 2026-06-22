import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/core/theme/app_typography.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/ui/app_snackbar.dart';
import '../../../../arenas/domain/arena_booking_success_actions.dart';
import '../../../../athlete/domain/athlete_display_name.dart';
import '../../../../athlete/domain/athlete_profile_providers.dart';
import '../../../domain/my_tournaments_models.dart';
import '../../../domain/tournament_discovery_providers.dart';
import '../../../domain/tournament_registration_logic.dart';

class TournamentRegistrationDirectOrganizerPanel extends ConsumerWidget {
  const TournamentRegistrationDirectOrganizerPanel({
    super.key,
    required this.tournamentName,
    required this.quote,
    this.managerId,
  });

  final String tournamentName;
  final TournamentRegistrationQuote quote;
  final String? managerId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final organizerId = managerId?.trim() ?? '';
    final organizerName = ref.watch(
      tournamentOrganizerDisplayProvider(organizerId),
    );
    final profile = organizerId.isNotEmpty
        ? ref.watch(athleteProfileByIdProvider(organizerId)).valueOrNull
        : null;
    final organizerInitials = profile != null
        ? athleteInitials(profile)
        : _initialsFromName(organizerName);
    final avatarUrl = profile?.avatarUrl?.trim();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _PrereserveAlert(theme: theme),
        const SizedBox(height: 16),
        _StepsCard(quote: quote, theme: theme),
        const SizedBox(height: 12),
        _OrganizerContactCard(
          organizerName: organizerName,
          organizerInitials: organizerInitials,
          avatarUrl: avatarUrl,
          phone: profile?.phoneNumber,
          tournamentName: tournamentName,
          categoryAmountLabel: formatRegistrationMoney(quote.displayTotal),
        ),
      ],
    );
  }

  static String _initialsFromName(String name) {
    final parts = name.split(' ').where((p) => p.isNotEmpty).toList();
    if (parts.isEmpty) return 'OR';
    if (parts.length == 1) {
      final word = parts.first;
      return word.length >= 2
          ? word.substring(0, 2).toUpperCase()
          : word.toUpperCase();
    }
    return '${parts.first[0]}${parts.last[0]}'.toUpperCase();
  }
}

class _PrereserveAlert extends StatelessWidget {
  const _PrereserveAlert({required this.theme});

  final ThemeData theme;

  @override
  Widget build(BuildContext context) {
    final parts = directOrganizerPrereserveAlertParts();
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.pending.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.pending.withValues(alpha: 0.35)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.schedule_rounded, size: 20, color: AppColors.pending),
          const SizedBox(width: 10),
          Expanded(
            child: RichText(
              text: TextSpan(
                style: theme.textTheme.bodySmall?.copyWith(
                  color: context.themeColors.onSurfaceMuted,
                  fontWeight: FontWeight.w500,
                  height: 1.45,
                ),
                children: [
                  TextSpan(text: parts.$1),
                  TextSpan(
                    text: parts.$2,
                    style: TextStyle(
                      color: AppColors.pending,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  TextSpan(text: parts.$3),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _StepsCard extends StatelessWidget {
  const _StepsCard({required this.quote, required this.theme});

  final TournamentRegistrationQuote quote;
  final ThemeData theme;

  @override
  Widget build(BuildContext context) {
    final steps = <({String title, String subtitle})>[
      (
        title: 'Reserve a vaga da sua dupla',
        subtitle: 'Grátis, sem cobrança no app.',
      ),
      (
        title: 'Combine o pagamento',
        subtitle: directOrganizerPaymentStep2Subtitle(quote),
      ),
      (
        title: 'Inscrição confirmada',
        subtitle: 'Assim que o organizador registrar o pagamento.',
      ),
    ];

    return Container(
      padding: const EdgeInsets.fromLTRB(16, 18, 16, 6),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceRaised,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
        ),
      ),
      child: Column(
        children: [
          for (var i = 0; i < steps.length; i++) ...[
            _StepRow(
              number: i + 1,
              title: steps[i].title,
              subtitle: steps[i].subtitle,
              theme: theme,
            ),
            if (i < steps.length - 1)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 14),
                child: Divider(
                  height: 1,
                  color: context.themeColors.onSurfaceMuted.withValues(
                    alpha: 0.12,
                  ),
                ),
              ),
          ],
        ],
      ),
    );
  }
}

class _StepRow extends StatelessWidget {
  const _StepRow({
    required this.number,
    required this.title,
    required this.subtitle,
    required this.theme,
  });

  final int number;
  final String title;
  final String subtitle;
  final ThemeData theme;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 28,
          height: 28,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: AppColors.brand.withValues(alpha: 0.16),
            shape: BoxShape.circle,
            border: Border.all(color: AppColors.brand.withValues(alpha: 0.45)),
          ),
          child: Text(
            '$number',
            style: AppTypography.mono(
              fontSize: 13,
              fontWeight: FontWeight.w800,
              color: AppColors.brand,
            ),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: theme.textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: context.themeColors.onSurface,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                subtitle,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: context.themeColors.onSurfaceMuted,
                  fontWeight: FontWeight.w500,
                  height: 1.4,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _OrganizerContactCard extends StatelessWidget {
  const _OrganizerContactCard({
    required this.organizerName,
    required this.organizerInitials,
    required this.avatarUrl,
    required this.phone,
    required this.tournamentName,
    required this.categoryAmountLabel,
  });

  final String organizerName;
  final String organizerInitials;
  final String? avatarUrl;
  final String? phone;
  final String tournamentName;
  final String categoryAmountLabel;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceRaised,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
        ),
      ),
      child: Row(
        children: [
          _StackedAvatars(
            organizerInitials: organizerInitials,
            avatarUrl: avatarUrl,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Combine com',
                  style: theme.textTheme.labelSmall?.copyWith(
                    color: context.themeColors.onSurfaceMuted,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 2),
                Row(
                  children: [
                    Flexible(
                      child: Text(
                        organizerName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.w800,
                          color: context.themeColors.onSurface,
                        ),
                      ),
                    ),
                    const SizedBox(width: 4),
                    Icon(
                      Icons.verified_rounded,
                      size: 16,
                      color: AppColors.win,
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          OutlinedButton.icon(
            onPressed: () => _contactOrganizer(context),
            style: OutlinedButton.styleFrom(
              foregroundColor: AppColors.win,
              side: BorderSide(color: AppColors.win.withValues(alpha: 0.45)),
              backgroundColor: AppColors.win.withValues(alpha: 0.1),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(999),
              ),
            ),
            icon: const Icon(Icons.chat_bubble_outline_rounded, size: 16),
            label: const Text(
              'Falar',
              style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _contactOrganizer(BuildContext context) async {
    final message =
        'Olá! Estou me inscrevendo no torneio $tournamentName '
        '($categoryAmountLabel por dupla) e gostaria de combinar o pagamento.';
    final url = ArenaBookingSuccessActions.buildWhatsAppUrl(
      phone: phone,
      message: message,
    );
    if (url == null) {
      showAppSnackBar(
        context,
        'Organizador sem WhatsApp cadastrado.',
        isError: true,
      );
      return;
    }
    final uri = Uri.tryParse(url);
    if (uri == null) {
      showAppSnackBar(
        context,
        'Não foi possível abrir o WhatsApp.',
        isError: true,
      );
      return;
    }
    final launched = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!context.mounted) return;
    if (!launched) {
      showAppSnackBar(
        context,
        'Não foi possível abrir o WhatsApp.',
        isError: true,
      );
    }
  }
}

class _StackedAvatars extends StatelessWidget {
  const _StackedAvatars({
    required this.organizerInitials,
    required this.avatarUrl,
  });

  final String organizerInitials;
  final String? avatarUrl;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 52,
      height: 36,
      child: Stack(
        children: [
          Positioned(
            left: 0,
            child: _AvatarBubble(
              initials: organizerInitials,
              avatarUrl: avatarUrl,
              backgroundColor: AppColors.brand.withValues(alpha: 0.22),
              borderColor: AppColors.brand.withValues(alpha: 0.5),
              textColor: AppColors.brand,
            ),
          ),
        ],
      ),
    );
  }
}

class _AvatarBubble extends StatelessWidget {
  const _AvatarBubble({
    required this.initials,
    this.avatarUrl,
    required this.backgroundColor,
    required this.borderColor,
    required this.textColor,
  });

  final String initials;
  final String? avatarUrl;
  final Color backgroundColor;
  final Color borderColor;
  final Color textColor;

  @override
  Widget build(BuildContext context) {
    final url = avatarUrl?.trim();
    return Container(
      width: 34,
      height: 34,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: backgroundColor,
        border: Border.all(color: borderColor, width: 1.5),
      ),
      clipBehavior: Clip.antiAlias,
      child: url != null && url.isNotEmpty
          ? CachedNetworkImage(
              imageUrl: url,
              fit: BoxFit.cover,
              errorWidget: (context, url, error) =>
                  _Initials(initials: initials, color: textColor),
            )
          : _Initials(initials: initials, color: textColor),
    );
  }
}

class _Initials extends StatelessWidget {
  const _Initials({required this.initials, required this.color});

  final String initials;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Text(
        initials,
        style: AppTypography.mono(
          fontSize: 11,
          fontWeight: FontWeight.w900,
          color: color,
        ),
      ),
    );
  }
}
