import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/formatting/app_currency_format.dart';
import '../../../core/layout/nexa_app_bar.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_radii.dart';
import '../../../core/theme/app_spacing.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/ui/nexa_card.dart';
import '../domain/substitution_journey_logic.dart';
import '../domain/tournament_discovery_models.dart';
import '../domain/tournament_partner_invite.dart';

/// Sucesso da substituição — troca a tela de acompanhamento (`pushReplacement`)
/// quando o convite vira `accepted`. Sem rota própria: chega por argumento de
/// construtor (`invite`/`registration`), não por path — nada além desta
/// navegação leva pra cá.
class TournamentSubstitutionSuccessPage extends StatelessWidget {
  const TournamentSubstitutionSuccessPage({
    super.key,
    required this.invite,
    required this.registration,
  });

  final TournamentPartnerInvite invite;
  final MyTournamentRegistration? registration;

  bool get _isTeam =>
      (registration?.teamSize ?? (invite.isTeamInvite ? 3 : 2)) >= 3;
  String get _unitWord => _isTeam ? 'equipe' : 'dupla';
  String get _unitWordCap => _isTeam ? 'Equipe' : 'Dupla';

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final tournamentName = registration?.tournamentName ?? 'Torneio';
    final categoryName = registration?.category?.name ?? invite.categoryId;
    final outName = invite.replacedName ?? 'Atleta';
    final inName = invite.inviteeName;
    final inFirst = _firstNameOf(inName);
    final isPaid = registration?.isPaid ?? false;
    final entryFee = registration?.category?.entryFee;
    final reasonLabel =
        invite.reason != null ? substitutionReasonLabels[invite.reason] : null;
    final inscriptionLabel = isPaid
        ? 'confirmada'
        : (registration?.statusLabel.toLowerCase() ?? 'confirmada');

    return Scaffold(
      backgroundColor: colors.canvas,
      appBar: NexaAppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('$_unitWordCap atualizada'),
            Text(
              '$tournamentName · $categoryName',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: AppTypography.bodyS.copyWith(color: colors.onSurfaceMuted),
            ),
          ],
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.screenH,
          AppSpacing.lg,
          AppSpacing.screenH,
          AppSpacing.xxl,
        ),
        children: [
          _SuccessHeroCard(
            inName: inName,
            inFirst: inFirst,
            unitWord: _unitWord,
          ),
          const SizedBox(height: AppSpacing.lg),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: _MiniCard(label: 'INSCRIÇÃO', value: inscriptionLabel),
              ),
              if (isPaid) ...[
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: _MiniCard(
                    label: 'PAGAMENTO',
                    value: formatBRL(entryFee ?? 0),
                  ),
                ),
              ],
            ],
          ),
          const SizedBox(height: AppSpacing.xl),
          NexaCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _SummaryLine(
                  title: '$outName saiu da $_unitWord',
                  subtitle: reasonLabel != null
                      ? 'Motivo: $reasonLabel · registrado com o organizador'
                      : null,
                ),
                const SizedBox(height: AppSpacing.md),
                _SummaryLine(
                  title: '$inName entrou',
                  subtitle: 'Dentro da categoria $categoryName',
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.lg),
          _TournamentCard(
            tournamentName: tournamentName,
            categoryName: categoryName,
            dateLabel: registration?.dateLabel,
            locationLine: registration?.locationLine,
          ),
          const SizedBox(height: AppSpacing.xl),
          SizedBox(
            height: 52,
            child: FilledButton(
              onPressed: () => context.pushReplacementNamed(
                AppRouteNames.tournamentRegistrationDetail,
                pathParameters: {
                  'tournamentId': invite.tournamentId,
                  'registrationId': invite.attachRegistrationId ??
                      registration?.registrationId ??
                      '',
                },
              ),
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.brand,
                foregroundColor: AppColors.black,
                shape: RoundedRectangleBorder(borderRadius: AppRadii.pillAll),
              ),
              child: const Text(
                'Ver inscrição →',
                style: TextStyle(fontWeight: FontWeight.w900, fontSize: 14),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _SuccessHeroCard extends StatelessWidget {
  const _SuccessHeroCard({
    required this.inName,
    required this.inFirst,
    required this.unitWord,
  });

  final String inName;
  final String inFirst;
  final String unitWord;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return NexaCard(
      side: BorderSide(color: AppColors.win.withValues(alpha: 0.4)),
      color: AppColors.win.withValues(alpha: 0.08),
      child: Column(
        children: [
          Container(
            width: 56,
            height: 56,
            decoration: const BoxDecoration(
              color: AppColors.win,
              shape: BoxShape.circle,
            ),
            child: const Icon(
              Icons.check_rounded,
              color: AppColors.white,
              size: 28,
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          Text(
            '$inName é sua nova $unitWord',
            textAlign: TextAlign.center,
            style: AppTypography.titleM.copyWith(color: colors.onSurface),
          ),
          const SizedBox(height: 4),
          Text(
            '$inFirst aceitou seu convite.',
            textAlign: TextAlign.center,
            style: AppTypography.bodyS.copyWith(color: colors.onSurfaceMuted),
          ),
        ],
      ),
    );
  }
}

class _MiniCard extends StatelessWidget {
  const _MiniCard({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return NexaCard(
      padding: const EdgeInsets.all(AppSpacing.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: AppTypography.eyebrow.copyWith(color: colors.onSurfaceMuted),
          ),
          const SizedBox(height: 4),
          Text(
            value,
            style: AppTypography.titleS.copyWith(color: colors.onSurface),
          ),
        ],
      ),
    );
  }
}

class _SummaryLine extends StatelessWidget {
  const _SummaryLine({required this.title, this.subtitle});

  final String title;
  final String? subtitle;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: AppTypography.bodyM.copyWith(color: colors.onSurface),
        ),
        if (subtitle != null) ...[
          const SizedBox(height: 2),
          Text(
            subtitle!,
            style: AppTypography.bodyS.copyWith(color: colors.onSurfaceMuted),
          ),
        ],
      ],
    );
  }
}

class _TournamentCard extends StatelessWidget {
  const _TournamentCard({
    required this.tournamentName,
    required this.categoryName,
    this.dateLabel,
    this.locationLine,
  });

  final String tournamentName;
  final String categoryName;
  final String? dateLabel;
  final String? locationLine;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final date = dateLabel ?? '';
    return NexaCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            tournamentName,
            style: AppTypography.titleS.copyWith(color: colors.onSurface),
          ),
          const SizedBox(height: 2),
          Text(
            date.isNotEmpty ? '$categoryName · $date' : categoryName,
            style: AppTypography.bodyS.copyWith(color: colors.onSurfaceMuted),
          ),
          if ((locationLine ?? '').isNotEmpty) ...[
            const SizedBox(height: 2),
            Text(
              locationLine!,
              style: AppTypography.bodyS.copyWith(color: colors.onSurfaceMuted),
            ),
          ],
        ],
      ),
    );
  }
}

String _firstNameOf(String fullName) {
  final trimmed = fullName.trim();
  if (trimmed.isEmpty) return 'Atleta';
  return trimmed.split(RegExp(r'\s+')).first;
}
