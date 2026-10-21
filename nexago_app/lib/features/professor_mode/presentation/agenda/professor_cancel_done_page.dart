import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../domain/professor_cancel.dart';

/// E5d · Aula cancelada — o que de fato aconteceu (avisados, créditos,
/// quadra), com os números do servidor. Sem "Desfazer": aula cancelada não
/// volta (a série não recria a data e a quadra já foi liberada).
class ProfessorCancelDonePage extends StatelessWidget {
  const ProfessorCancelDonePage({
    super.key,
    required this.message,
    required this.rows,
  });

  final String message;
  final List<ProfessorCancelImpact> rows;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Scaffold(
      backgroundColor: colors.canvas,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 48, 20, 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Center(
                child: Container(
                  width: 72,
                  height: 72,
                  decoration: BoxDecoration(
                    color: colors.onSurface.withValues(alpha: 0.05),
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(
                      color: colors.onSurface.withValues(alpha: 0.10),
                    ),
                  ),
                  child: Icon(
                    Icons.check_rounded,
                    size: 30,
                    color: colors.onSurface,
                  ),
                ),
              ),
              const SizedBox(height: 22),
              Text(
                'Aula cancelada',
                textAlign: TextAlign.center,
                style: AppTypography.soraRegular(
                  fontSize: 24,
                  fontWeight: FontWeight.w800,
                  color: colors.onSurface,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                message,
                key: const Key('professor-cancel-done-message'),
                textAlign: TextAlign.center,
                style: AppTypography.soraRegular(
                  fontSize: 13.5,
                  fontWeight: FontWeight.w500,
                  height: 1.45,
                  color: colors.onSurfaceMuted,
                ),
              ),
              const SizedBox(height: 22),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 14),
                decoration: BoxDecoration(
                  color: colors.onSurface.withValues(alpha: 0.03),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(
                    color: colors.onSurface.withValues(alpha: 0.10),
                  ),
                ),
                child: Column(
                  children: [
                    for (var i = 0; i < rows.length; i++)
                      _Row(row: rows[i], last: i == rows.length - 1),
                  ],
                ),
              ),
              const Spacer(),
              SizedBox(
                height: 54,
                child: FilledButton(
                  key: const Key('professor-cancel-done-back'),
                  onPressed: () => context.go(AppRoutes.professorAgenda),
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.brand,
                    foregroundColor: const Color(0xFF0A0A0A),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16),
                    ),
                  ),
                  child: Text(
                    'Voltar para agenda',
                    style: AppTypography.soraRegular(
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({required this.row, required this.last});

  final ProfessorCancelImpact row;
  final bool last;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 12),
      decoration: BoxDecoration(
        border: last
            ? null
            : Border(
                bottom: BorderSide(
                  color: colors.onSurface.withValues(alpha: 0.08),
                ),
              ),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  row.title,
                  style: AppTypography.soraRegular(
                    fontSize: 13.5,
                    fontWeight: FontWeight.w600,
                    color: colors.onSurface,
                  ),
                ),
                if (row.sub.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(
                    row.sub,
                    style: AppTypography.mono(
                      fontSize: 10,
                      color: colors.onSurfaceMuted,
                    ),
                  ),
                ],
              ],
            ),
          ),
          Text(
            row.value,
            style: AppTypography.soraRegular(
              fontSize: 14,
              fontWeight: FontWeight.w700,
              color: switch (row.tone) {
                ProfessorCancelTone.win => colors.win,
                ProfessorCancelTone.live => colors.live,
                ProfessorCancelTone.normal => colors.onSurface,
              },
            ),
          ),
        ],
      ),
    );
  }
}
