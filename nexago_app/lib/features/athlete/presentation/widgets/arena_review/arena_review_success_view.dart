import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../domain/arena_review_eligibility.dart';
import '../../../domain/arena_review_form_logic.dart';

/// Próxima reserva sugerida depois de uma nota boa: mesmo dia da semana, horário e
/// quadra. A disponibilidade não é conferida aqui; os horários da arena mostram.
class ArenaReviewRebookSuggestion {
  const ArenaReviewRebookSuggestion({
    required this.date,
    required this.startTime,
    required this.courtName,
  });

  final DateTime date;
  final String startTime;
  final String courtName;
}

/// Fim da avaliação: confirma o envio, mostra o XP e, com nota boa, oferece
/// "Jogar de novo" no mesmo horário.
class ArenaReviewSuccessView extends StatelessWidget {
  const ArenaReviewSuccessView({
    super.key,
    required this.arenaName,
    required this.rating,
    required this.onBack,
    this.rebook,
    this.onRebook,
  });

  final String arenaName;
  final int rating;
  final VoidCallback onBack;
  final ArenaReviewRebookSuggestion? rebook;
  final VoidCallback? onRebook;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final arena = arenaName.trim().isEmpty ? 'A arena' : arenaName.trim();
    final message = switch (arenaReviewToneFor(rating)) {
      ArenaReviewTone.praise => '$arena vai ver o que se destacou.',
      ArenaReviewTone.improve =>
        '$arena recebe sua nota e o que pode melhorar. A resposta dela aparece '
            'no perfil da arena.',
    };
    final suggestion = rebook;
    final showRebook = suggestion != null && onRebook != null;

    return Column(
      key: const ValueKey('arena-review-success'),
      children: [
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(24, 32, 24, 24),
            child: Column(
              children: [
                Container(
                  width: 76,
                  height: 76,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: colors.win.withValues(alpha: 0.08),
                    border: Border.all(color: colors.win, width: 2),
                  ),
                  child: Icon(Icons.check_rounded, size: 38, color: colors.win),
                ),
                const SizedBox(height: 18),
                Semantics(
                  header: true,
                  child: Text(
                    'Avaliação enviada',
                    style: AppTypography.soraRegular(
                      fontSize: 22,
                      color: colors.onSurface,
                    ),
                  ),
                ),
                const SizedBox(height: 10),
                _XpBadge(),
                const SizedBox(height: 14),
                Text(
                  message,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 14,
                    height: 1.45,
                    color: colors.onSurface.withValues(alpha: 0.78),
                  ),
                ),
                if (showRebook) ...[
                  const SizedBox(height: 28),
                  _RebookCard(suggestion: suggestion, onRebook: onRebook!),
                ],
              ],
            ),
          ),
        ),
        Container(
          padding: const EdgeInsets.fromLTRB(20, 14, 20, 14),
          decoration: BoxDecoration(
            border: Border(
              top: BorderSide(color: colors.outline.withValues(alpha: 0.35)),
            ),
          ),
          child: SizedBox(
            height: 52,
            width: double.infinity,
            child: showRebook
                ? OutlinedButton(
                    key: const ValueKey('arena-review-back'),
                    onPressed: onBack,
                    style: OutlinedButton.styleFrom(
                      foregroundColor: colors.onSurface,
                      side: BorderSide(
                          color: colors.outline.withValues(alpha: 0.45)),
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14)),
                    ),
                    child: const Text('Voltar para a agenda',
                        style: TextStyle(
                            fontWeight: FontWeight.w700, fontSize: 15)),
                  )
                : FilledButton(
                    key: const ValueKey('arena-review-back'),
                    onPressed: onBack,
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.brand,
                      foregroundColor: AppColors.black,
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14)),
                    ),
                    child: const Text('Voltar para a agenda',
                        style: TextStyle(
                            fontWeight: FontWeight.w700, fontSize: 15)),
                  ),
          ),
        ),
      ],
    );
  }
}

class _XpBadge extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: AppColors.brand.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: AppColors.brand.withValues(alpha: 0.45)),
      ),
      child: Text(
        '+$arenaReviewXp XP no seu progresso',
        style: AppTypography.mono(
          fontSize: 11,
          fontWeight: FontWeight.w600,
          color: colors.brandText,
        ),
      ),
    );
  }
}

class _RebookCard extends StatelessWidget {
  const _RebookCard({required this.suggestion, required this.onRebook});

  final ArenaReviewRebookSuggestion suggestion;
  final VoidCallback onRebook;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final when = [
      arenaReviewRebookLabel(suggestion.date),
      suggestion.startTime.trim(),
    ].where((p) => p.isNotEmpty).join(' · ');
    final where = [
      suggestion.courtName.trim(),
      'mesmo horário',
    ].where((p) => p.isNotEmpty).join(' · ');
    return Container(
      key: const ValueKey('arena-review-rebook'),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: colors.outline.withValues(alpha: 0.35)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'JOGAR DE NOVO',
            style: AppTypography.mono(
              fontSize: 10,
              fontWeight: FontWeight.w600,
              letterSpacing: 1.5,
              color: colors.brandText,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            when,
            style: TextStyle(
              fontWeight: FontWeight.w700,
              fontSize: 16,
              color: colors.onSurface,
            ),
          ),
          const SizedBox(height: 2),
          Text(where,
              style: TextStyle(fontSize: 13, color: colors.onSurfaceMuted)),
          const SizedBox(height: 14),
          SizedBox(
            height: 46,
            child: FilledButton(
              key: const ValueKey('arena-review-rebook-open'),
              onPressed: onRebook,
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.brand,
                foregroundColor: AppColors.black,
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12)),
              ),
              child: const Text('Ver horários',
                  style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
            ),
          ),
        ],
      ),
    );
  }
}
