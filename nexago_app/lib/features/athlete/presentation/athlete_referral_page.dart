import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/core/layout/nexa_app_bar.dart';

import '../../../core/auth/auth_providers.dart';
import '../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../../core/ui/feedback/feedback_published_share_row.dart';
import '../../../core/ui/nexa_share.dart';
import '../data/athlete_referral_service.dart';
import '../domain/athlete_referral_providers.dart';

/// "Convide um amigo": código/link de indicação do próprio atleta + share.
///
/// Recompensa: +[AthleteReferralService.xpReferralBonus] XP creditados ao
/// indicador quando o amigo indicado conclui a 1ª partida (server-side,
/// `functions/src/athlete-referral.ts`). Não há crédito no cadastro puro.
class AthleteReferralPage extends ConsumerWidget {
  const AthleteReferralPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final uid = ref.watch(authProvider).valueOrNull?.uid ?? '';
    final code = ref.read(athleteReferralServiceProvider).referralCodeFor(uid);

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      appBar: _appBar(context, theme),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
          children: [
            Center(
              child: Container(
                width: 72,
                height: 72,
                decoration: BoxDecoration(
                  color: AppColors.brand.withValues(alpha: 0.15),
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.card_giftcard_rounded,
                  color: AppColors.brand,
                  size: 34,
                ),
              ),
            ),
            const SizedBox(height: 20),
            Text(
              'Indique amigos, ganhe XP',
              textAlign: TextAlign.center,
              style: theme.textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.w800,
                color: context.themeColors.onSurface,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Compartilhe seu código. Quando seu amigo se cadastrar e jogar a '
              'primeira partida, você ganha +${AthleteReferralService.xpReferralBonus} XP.',
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: context.themeColors.onSurfaceMuted,
                height: 1.4,
              ),
            ),
            const SizedBox(height: 28),
            if (code.isEmpty)
              Center(
                child: Text(
                  'Faça login para ver seu código de indicação.',
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: context.themeColors.onSurfaceMuted,
                  ),
                ),
              )
            else ...[
              _ReferralCodeCard(code: code),
              const SizedBox(height: 24),
              Center(
                child: FeedbackPublishedShareRow(
                  onShare: () => nexaShareText(context, _shareText(code)),
                  onCopyLink: () async {
                    await Clipboard.setData(ClipboardData(text: code));
                    if (context.mounted) {
                      showAppSnackBar(context, 'Código copiado.');
                    }
                  },
                ),
              ),
            ],
            const SizedBox(height: 32),
            _HowItWorksSection(theme: theme),
          ],
        ),
      ),
    );
  }

  String _shareText(String code) =>
      'Vem jogar comigo no nexaGO! Use meu código de indicação $code ao se '
      'cadastrar — quando você jogar sua primeira partida, a gente ganha XP. '
      'Baixe o app: https://nexago.app';

  PreferredSizeWidget _appBar(BuildContext context, ThemeData theme) {
    return NexaAppBar(
      backgroundColor: context.themeColors.canvas,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      centerTitle: true,
      leading: Padding(
        padding: const EdgeInsets.only(left: 12),
        child: Center(
          child: Material(
            color: context.themeColors.surfaceRaised,
            borderRadius: BorderRadius.circular(12),
            child: InkWell(
              onTap: () => Navigator.of(context).maybePop(),
              borderRadius: BorderRadius.circular(12),
              child: SizedBox(
                width: 40,
                height: 40,
                child: Icon(
                  Icons.chevron_left_rounded,
                  color: context.themeColors.onSurface,
                ),
              ),
            ),
          ),
        ),
      ),
      title: Text(
        'Convide um amigo',
        style: theme.textTheme.titleLarge?.copyWith(
          fontWeight: FontWeight.w800,
          color: context.themeColors.onSurface,
          letterSpacing: -0.3,
        ),
      ),
    );
  }
}

class _ReferralCodeCard extends StatelessWidget {
  const _ReferralCodeCard({required this.code});

  final String code;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: context.themeColors.surfaceRaised,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.15),
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'SEU CÓDIGO DE INDICAÇÃO',
              style: theme.textTheme.labelSmall?.copyWith(
                color: context.themeColors.onSurfaceMuted,
                fontWeight: FontWeight.w800,
                letterSpacing: 0.8,
                fontSize: 10,
              ),
            ),
            const SizedBox(height: 8),
            SelectableText(
              code,
              style: AppTypography.mono(
                fontSize: 15,
                fontWeight: FontWeight.w700,
                color: context.themeColors.onSurface,
                letterSpacing: 0.2,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _HowItWorksSection extends StatelessWidget {
  const _HowItWorksSection({required this.theme});

  final ThemeData theme;

  static const _steps = [
    'Compartilhe seu código com um amigo.',
    'Ele informa o código ao criar a conta no nexaGO.',
    'Quando ele joga a primeira partida, vocês dois comemoram — você ganha XP.',
  ];

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'COMO FUNCIONA',
          style: theme.textTheme.labelSmall?.copyWith(
            color: context.themeColors.onSurfaceMuted,
            fontWeight: FontWeight.w800,
            letterSpacing: 0.8,
            fontSize: 10,
          ),
        ),
        const SizedBox(height: 12),
        for (var i = 0; i < _steps.length; i++)
          Padding(
            padding: EdgeInsets.only(bottom: i == _steps.length - 1 ? 0 : 12),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 24,
                  height: 24,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: AppColors.brand.withValues(alpha: 0.15),
                    shape: BoxShape.circle,
                  ),
                  child: Text(
                    '${i + 1}',
                    style: theme.textTheme.labelSmall?.copyWith(
                      color: AppColors.brand,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    _steps[i],
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: context.themeColors.onSurfaceMuted,
                      height: 1.4,
                    ),
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}
