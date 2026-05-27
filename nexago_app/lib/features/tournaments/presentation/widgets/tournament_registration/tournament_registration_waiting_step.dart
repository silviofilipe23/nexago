import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../domain/tournament_registration_logic.dart';
import 'tournament_registration_dashed_border.dart';

class TournamentRegistrationWaitingStep extends StatelessWidget {
  const TournamentRegistrationWaitingStep({
    super.key,
    required this.partner,
    required this.athleteDisplayName,
    required this.athleteInitials,
    this.onResendInvite,
    this.onCancelRegistration,
    this.onContinueBrowsing,
    this.inviteAccepted = false,
    this.partnerPendingSubtitle = 'Pendente',
    this.reservationHoursLabel = '24 horas',
  });

  final TournamentRegistrationPartnerCandidate partner;
  final String athleteDisplayName;
  final String athleteInitials;
  final VoidCallback? onResendInvite;
  final VoidCallback? onCancelRegistration;
  final VoidCallback? onContinueBrowsing;
  final bool inviteAccepted;
  final String partnerPendingSubtitle;
  final String reservationHoursLabel;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final firstName = partner.name.split(' ').first;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Center(
          child: SizedBox(
            width: 160,
            height: 160,
            child: Stack(
              alignment: Alignment.center,
              children: [
                Container(
                  width: 160,
                  height: 160,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: AppColors.pending.withValues(alpha: 0.08),
                  ),
                ),
                Container(
                  width: 120,
                  height: 120,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: AppColors.pending.withValues(alpha: 0.14),
                  ),
                ),
                Container(
                  width: 100,
                  height: 100,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: AppColors.pending,
                    boxShadow: [
                      BoxShadow(
                        color: AppColors.pending.withValues(alpha: 0.4),
                        blurRadius: 40,
                        offset: const Offset(0, 12),
                      ),
                    ],
                  ),
                  child: const Icon(
                    Icons.schedule_rounded,
                    size: 44,
                    color: AppColors.black,
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 32),
        Center(
          child: Column(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: (inviteAccepted ? AppColors.win : AppColors.pending)
                      .withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(
                    color: (inviteAccepted ? AppColors.win : AppColors.pending)
                        .withValues(alpha: 0.45),
                  ),
                ),
                child: Text(
                  inviteAccepted ? 'Parceiro confirmou' : 'Aguardando confirmação',
                  style: AppTypography.mono(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: inviteAccepted ? AppColors.win : AppColors.pending,
                    letterSpacing: 0.4,
                  ),
                ),
              ),
              const SizedBox(height: 14),
              Text(
                inviteAccepted
                    ? '$firstName aceitou!\nSigam para o pagamento.'
                    : '$firstName recebeu\nseu convite.',
                textAlign: TextAlign.center,
                style: AppTypography.soraRegular(
                  fontSize: 26,
                  fontWeight: FontWeight.w800,
                  color: AppColors.onSurface,
                  height: 1.1,
                  letterSpacing: -0.4,
                ),
              ),
              const SizedBox(height: 8),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8),
                child: Text.rich(
                  TextSpan(
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: AppColors.onSurfaceMuted,
                      height: 1.5,
                      fontWeight: FontWeight.w500,
                    ),
                    children: [
                      const TextSpan(
                        text:
                            'Avisamos pelo app e por celular. Sua vaga fica reservada por ',
                      ),
                      TextSpan(
                        text: reservationHoursLabel,
                        style: TextStyle(
                          color: AppColors.pending,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const TextSpan(text: '.'),
                    ],
                  ),
                  textAlign: TextAlign.center,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 32),
        Container(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            color: AppColors.surfaceCard,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'SUA DUPLA',
                style: AppTypography.mono(
                  fontSize: 10,
                  fontWeight: FontWeight.w600,
                  color: AppColors.onSurfaceMuted.withValues(alpha: 0.5),
                  letterSpacing: 1.4,
                ),
              ),
              const SizedBox(height: 14),
              _DuoRow(
                initials: athleteInitials,
                name: athleteDisplayName,
                subtitle: 'Você · confirmado',
                confirmed: true,
              ),
              Divider(
                height: 24,
                color: Colors.white.withValues(alpha: 0.08),
              ),
              _DuoRow(
                initials: partner.initials,
                name: partner.name,
                subtitle: partnerPendingSubtitle,
                confirmed: inviteAccepted,
                dashedAvatar: !inviteAccepted,
              ),
            ],
          ),
        ),
        const SizedBox(height: 24),
        FilledButton(
          onPressed: onContinueBrowsing,
          style: FilledButton.styleFrom(
            backgroundColor: AppColors.brand,
            foregroundColor: AppColors.black,
            padding: const EdgeInsets.symmetric(vertical: 14),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
          ),
          child: const Text(
            'Continuar no app',
            style: TextStyle(fontWeight: FontWeight.w800),
          ),
        ),
        const SizedBox(height: 10),
        OutlinedButton(
          onPressed: onResendInvite,
          style: OutlinedButton.styleFrom(
            foregroundColor: AppColors.onSurface,
            side: BorderSide(
              color: AppColors.onSurfaceMuted.withValues(alpha: 0.25),
            ),
            padding: const EdgeInsets.symmetric(vertical: 14),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
          ),
          child: const Text(
            'Reenviar convite',
            style: TextStyle(fontWeight: FontWeight.w700),
          ),
        ),
        TextButton(
          onPressed: onCancelRegistration,
          child: Text(
            'Cancelar inscrição',
            style: theme.textTheme.bodyMedium?.copyWith(
              color: AppColors.onSurfaceMuted,
              fontWeight: FontWeight.w500,
            ),
          ),
        ),
      ],
    );
  }
}

class _DuoRow extends StatelessWidget {
  const _DuoRow({
    required this.initials,
    required this.name,
    required this.subtitle,
    required this.confirmed,
    this.dashedAvatar = false,
  });

  final String initials;
  final String name;
  final String subtitle;
  final bool confirmed;
  final bool dashedAvatar;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    Widget avatar;
    if (dashedAvatar) {
      avatar = TournamentRegistrationDashedBorder(
        radius: 20,
        child: Container(
          width: 40,
          height: 40,
          alignment: Alignment.center,
          child: Text(
            initials,
            style: AppTypography.mono(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: AppColors.onSurfaceMuted,
            ),
          ),
        ),
      );
    } else {
      avatar = Container(
        width: 40,
        height: 40,
        alignment: Alignment.center,
        decoration: const BoxDecoration(
          shape: BoxShape.circle,
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [AppColors.brand, Color(0xFFCC0000)],
          ),
        ),
        child: Text(
          initials,
          style: AppTypography.mono(
            fontSize: 11,
            fontWeight: FontWeight.w700,
            color: AppColors.white,
          ),
        ),
      );
    }

    return Row(
      children: [
        avatar,
        const SizedBox(width: 14),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                name,
                style: theme.textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.w600,
                  color: dashedAvatar
                      ? AppColors.onSurfaceMuted
                      : AppColors.onSurface,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                subtitle,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: dashedAvatar
                      ? AppColors.pending
                      : AppColors.onSurfaceMuted,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
        ),
        if (confirmed)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              color: AppColors.win.withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(8),
            ),
            child: const Icon(
              Icons.check_rounded,
              size: 16,
              color: AppColors.win,
            ),
          ),
      ],
    );
  }
}
