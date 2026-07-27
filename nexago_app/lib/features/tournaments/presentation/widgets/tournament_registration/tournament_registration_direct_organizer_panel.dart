import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/core/theme/app_typography.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../../core/auth/auth_providers.dart';
import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/ui/app_snackbar.dart';
import '../../../../arenas/domain/arena_booking_success_actions.dart';
import '../../../../athlete/domain/athlete_display_name.dart';
import '../../../../athlete/domain/athlete_profile.dart';
import '../../../../athlete/domain/athlete_profile_providers.dart';
import '../../../../athlete/domain/profile_access.dart';
import '../../../../athlete/presentation/widgets/athlete_profile_avatar.dart';
import '../../../domain/pix_brcode.dart';
import '../../../domain/tournament_discovery_providers.dart';
import '../../../domain/tournament_registration_logic.dart';

class TournamentRegistrationDirectOrganizerPanel extends ConsumerWidget {
  const TournamentRegistrationDirectOrganizerPanel({
    super.key,
    required this.tournamentId,
    required this.tournamentName,
    required this.quote,
    required this.paymentType,
    required this.onPaymentTypeChanged,
    this.dualPaymentOnly = false,
    this.managerId,
    this.pixKey = '',
    this.pixKeyType = '',
    this.pixRecipientName = '',
    this.pixCity = '',
    this.tournamentCity = '',
  });

  final String tournamentId;
  final String tournamentName;
  final TournamentRegistrationQuote quote;
  final String paymentType;
  final ValueChanged<String> onPaymentTypeChanged;
  final bool dualPaymentOnly;
  final String? managerId;
  final String pixKey;
  final String pixKeyType;
  final String pixRecipientName;
  final String pixCity;

  /// Cidade do torneio — fallback quando o organizador não configurou
  /// cidade na chave PIX (campo 60 exige cidade real; "BRASIL" é rejeitado
  /// por alguns bancos).
  final String tournamentCity;

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
    final authUser = ref.watch(authProvider).valueOrNull;
    final organizerInitials = profile != null
        ? athleteInitials(profile)
        : _initialsFromName(organizerName);
    final avatarUrl = _organizerAvatarUrl(
      profile: profile,
      authUser: authUser,
      organizerId: organizerId,
    );
    final amountForPix = directOrganizerPixAmount(quote, paymentType);
    final amountLabel = paymentAmountLabel(
      quote: quote,
      amountType: paymentType,
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _DirectOrganizerHint(
          theme: theme,
          quote: quote,
          paymentType: paymentType,
        ),
        if (!dualPaymentOnly) ...[
          const SizedBox(height: 16),
          SegmentedButton<String>(
            segments: const [
              ButtonSegment(value: 'share', label: Text('Minha parte')),
              ButtonSegment(value: 'full', label: Text('Integral')),
            ],
            selected: {paymentType},
            onSelectionChanged: (selection) {
              if (selection.isEmpty) return;
              onPaymentTypeChanged(selection.first);
            },
          ),
        ],
        if (PixBrCode.isLikelyValidKey(pixKey)) ...[
          const SizedBox(height: 16),
          _PixCard(
            brCode: PixBrCode.build(
              key: pixKey,
              keyType: pixKeyType,
              recipientName: pixRecipientName.isNotEmpty
                  ? pixRecipientName
                  : organizerName,
              city: pixCity.isNotEmpty
                  ? pixCity
                  : (tournamentCity.isNotEmpty ? tournamentCity : 'BRASIL'),
              amount: amountForPix,
              txid: 'INSC$tournamentId',
            ),
            pixKey: pixKey,
            recipientName: pixRecipientName.isNotEmpty
                ? pixRecipientName
                : organizerName,
            amountLabel: amountLabel,
            amountType: paymentType,
            theme: theme,
          ),
        ],
        const SizedBox(height: 16),
        // _StepsCard(quote: quote, theme: theme),
        // const SizedBox(height: 12),
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

  static String? _organizerAvatarUrl({
    required AthleteProfile? profile,
    required String organizerId,
    required User? authUser,
  }) {
    if (profile == null) return null;
    final effective = organizerId.isNotEmpty && organizerId == authUser?.uid
        ? effectiveProfileForTournamentAccess(profile, authUser)
        : profile;
    final url = effective?.avatarUrl?.trim();
    if (url == null || url.isEmpty) return null;
    return url;
  }
}

class _DirectOrganizerHint extends StatelessWidget {
  const _DirectOrganizerHint({
    required this.theme,
    required this.quote,
    required this.paymentType,
  });

  final ThemeData theme;
  final TournamentRegistrationQuote quote;
  final String paymentType;

  @override
  Widget build(BuildContext context) {
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
          Icon(Icons.info_outline_rounded, size: 20, color: AppColors.pending),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              directOrganizerShareHint(quote, paymentType),
              style: theme.textTheme.bodySmall?.copyWith(
                color: context.themeColors.onSurfaceMuted,
                fontWeight: FontWeight.w500,
                height: 1.45,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _PixCard extends StatelessWidget {
  const _PixCard({
    required this.brCode,
    required this.pixKey,
    required this.recipientName,
    required this.amountLabel,
    required this.amountType,
    required this.theme,
  });

  final String brCode;
  final String pixKey;
  final String recipientName;
  final String amountLabel;
  final String amountType;
  final ThemeData theme;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceRaised,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.brand.withValues(alpha: 0.35)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Icon(Icons.pix_rounded, size: 18, color: AppColors.brand),
              const SizedBox(width: 8),
              Text(
                amountType == 'full' ? 'PIX integral' : 'PIX — sua parcela',
                style: theme.textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: context.themeColors.onSurface,
                ),
              ),
              const Spacer(),
              Text(
                amountLabel,
                style: AppTypography.mono(
                  fontSize: 16,
                  fontWeight: FontWeight.w900,
                  color: AppColors.brand,
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Center(
            child: Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
              ),
              child: QrImageView(
                data: brCode,
                version: QrVersions.auto,
                size: 200,
                gapless: false,
                backgroundColor: Colors.white,
              ),
            ),
          ),
          const SizedBox(height: 14),
          Text(
            'Recebedor: $recipientName',
            style: theme.textTheme.bodySmall?.copyWith(
              color: context.themeColors.onSurfaceMuted,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 10),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(
              color: context.themeColors.surfaceCard,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(
                color: context.themeColors.onSurfaceMuted.withValues(
                  alpha: 0.12,
                ),
              ),
            ),
            child: Text(
              brCode,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: AppTypography.mono(
                fontSize: 11,
                color: context.themeColors.onSurfaceMuted,
              ),
            ),
          ),
          const SizedBox(height: 10),
          OutlinedButton.icon(
            onPressed: () => _copy(context),
            style: OutlinedButton.styleFrom(
              foregroundColor: AppColors.brand,
              side: BorderSide(color: AppColors.brand.withValues(alpha: 0.45)),
              padding: const EdgeInsets.symmetric(vertical: 12),
            ),
            icon: const Icon(Icons.copy_rounded, size: 16),
            label: const Text(
              'Copiar código PIX',
              style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _copy(BuildContext context) async {
    await Clipboard.setData(ClipboardData(text: brCode));
    if (!context.mounted) return;
    showAppSnackBar(context, 'Código PIX copiado.');
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
          AthleteProfileAvatar(
            size: 48,
            initials: organizerInitials,
            imageUrl: avatarUrl,
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
