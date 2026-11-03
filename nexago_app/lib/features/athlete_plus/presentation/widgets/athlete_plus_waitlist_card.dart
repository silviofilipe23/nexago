import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/errors/friendly_error_message.dart';
import '../../../../core/observability/analytics_log.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../../core/ui/app_snackbar.dart';
import '../../application/athlete_plus_providers.dart';
import 'athlete_plus_waitlist_sheet.dart';

/// "Exibido" conta uma vez por sessão do app, não a cada rebuild da Início.
bool _shownLogged = false;

@visibleForTesting
void resetAthletePlusCardShownLog() => _shownLogged = false;

/// Convite da lista de espera do nexaGO+ na Início (Fase 0 da spec
/// `2026-11-03-nexago-plus-atleta-design.md`).
///
/// Só aparece com `appConfig/athletePlus.waitlistEnabled` ligado e enquanto o
/// atleta não respondeu; entrou na lista ou dispensou, some de vez. Fora disso
/// não ocupa espaço nenhum — nem o respiro da seção.
class AthletePlusWaitlistCard extends ConsumerWidget {
  const AthletePlusWaitlistCard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (!ref.watch(athletePlusCardVisibleProvider)) {
      return const SizedBox.shrink();
    }
    if (!_shownLogged) {
      _shownLogged = true;
      logAnalytics(ref, (a) => a.logAthletePlusCardShown());
    }

    final colors = context.themeColors;

    Future<void> dismiss() async {
      logAnalytics(ref, (a) => a.logAthletePlusCardDismissed());
      try {
        await ref
            .read(athletePlusRepositoryProvider)
            .dismiss(ref.read(athletePlusUidProvider));
      } catch (e) {
        if (!context.mounted) return;
        showAppSnackBar(
          context,
          friendlyErrorMessage(
            e,
            action: 'Não foi possível dispensar o aviso',
            logReason: 'athlete_plus_dismiss',
          ),
          isError: true,
        );
      }
    }

    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenH,
        0,
        AppSpacing.screenH,
        AppSpacing.sectionGap,
      ),
      child: Material(
        color: colors.surfaceCard,
        borderRadius: AppRadii.lgAll,
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          key: const Key('athlete-plus-card'),
          onTap: () {
            logAnalytics(ref, (a) => a.logAthletePlusSheetOpened());
            showAthletePlusWaitlistSheet(context);
          },
          child: Container(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.lg,
              AppSpacing.lg,
              AppSpacing.xs,
              AppSpacing.lg,
            ),
            decoration: BoxDecoration(
              borderRadius: AppRadii.lgAll,
              border: Border.all(
                color: AppColors.brand.withValues(alpha: 0.25),
              ),
              gradient: LinearGradient(
                colors: [
                  AppColors.brand.withValues(alpha: 0.10),
                  colors.surfaceCard,
                ],
                stops: const [0, 0.7],
              ),
            ),
            child: Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: AppColors.brand.withValues(alpha: 0.14),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                    Icons.workspace_premium_rounded,
                    color: colors.brandText,
                    size: 22,
                  ),
                ),
                const SizedBox(width: AppSpacing.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'EM BREVE',
                        style: AppTypography.eyebrow.copyWith(
                          color: colors.brandText,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        'nexaGO+',
                        style: AppTypography.titleS.copyWith(
                          color: colors.onSurface,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        'Selo de assinante, seu mês em números e '
                        'vantagens nas inscrições. Quer ser avisado?',
                        maxLines: 3,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.bodyS.copyWith(
                          color: colors.onSurfaceMuted,
                        ),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  key: const Key('athlete-plus-dismiss'),
                  tooltip: 'Agora não',
                  onPressed: dismiss,
                  icon: Icon(
                    Icons.close_rounded,
                    size: 20,
                    color: colors.onSurfaceMuted,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
