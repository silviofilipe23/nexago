import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_spacing.dart';
import '../../../../../core/theme/app_typography.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../athlete/domain/match_history/athlete_match_detail_providers.dart';
import '../../../../athlete/presentation/widgets/match_detail/match_detail_share_section.dart';

/// Compartilhar a próxima partida direto do Focus.
///
/// Reusa o MESMO componente da tela da partida (`MatchDetailShareSection`), que
/// já monta o pôster, escolhe entre a folha nativa e o download, e trata o erro.
/// O pôster é arte desenhada à mão que precisa mudar junto com a da web — uma
/// segunda implementação aqui seria a terceira cópia do mesmo desenho.
Future<void> showFocusShareMatchSheet(
  BuildContext context,
  String matchId,
) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _FocusShareMatchSheet(matchId: matchId),
  );
}

class _FocusShareMatchSheet extends ConsumerWidget {
  const _FocusShareMatchSheet({required this.matchId});

  final String matchId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final detail = ref.watch(athleteMatchDetailProvider(matchId)).valueOrNull;
    final poster = detail?.sharePoster;

    return SafeArea(
      top: false,
      child: Container(
        decoration: BoxDecoration(
          color: colors.surfaceSheet,
          borderRadius: const BorderRadius.vertical(
            top: Radius.circular(24),
          ),
        ),
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.screenH,
          AppSpacing.md,
          AppSpacing.screenH,
          AppSpacing.xl,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 36,
              height: 4,
              margin: const EdgeInsets.only(bottom: AppSpacing.lg),
              decoration: BoxDecoration(
                color: colors.outline,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            if (poster == null)
              Padding(
                padding: const EdgeInsets.all(AppSpacing.xxl),
                child: detail == null
                    ? const CircularProgressIndicator(color: AppColors.brand)
                    : Text(
                        'Esta partida ainda não tem card para compartilhar.',
                        textAlign: TextAlign.center,
                        style: AppTypography.bodyM
                            .copyWith(color: colors.onSurfaceMuted),
                      ),
              )
            else
              MatchDetailShareSection(
                poster: poster,
                presentation: MatchDetailSharePresentation.sheet,
              ),
          ],
        ),
      ),
    );
  }
}
