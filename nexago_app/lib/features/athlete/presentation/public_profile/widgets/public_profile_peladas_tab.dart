import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../../core/router/routes.dart';
import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../../arenas/domain/booking_result_record.dart';
import '../../../../arenas/domain/pelada.dart';
import '../../../../arenas/presentation/peladas_list.dart';
import '../../../../arenas/presentation/widgets/pelada/pelada_widgets.dart';

/// 00d · Aba Peladas do perfil público: os números do ano e as últimas três
/// peladas confirmadas de [userId].
class PublicProfilePeladasTab extends StatelessWidget {
  const PublicProfilePeladasTab({
    super.key,
    required this.userId,
    required this.peladas,
  });

  final String userId;

  /// Só confirmadas (a rule não entrega o resto a terceiros).
  final List<SavedBookingResult> peladas;

  @override
  Widget build(BuildContext context) {
    final mine = peladasOf(
      [
        for (final s in peladas)
          if (s.isConfirmed) s
      ],
      userId,
    );
    final summary = peladasSummary(mine, userId, year: DateTime.now().year);
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: PeladaStatBox(
                  value: '${summary.sessions}',
                  label: 'Horários',
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: PeladaStatBox(
                  value: '${(summary.winRate * 100).round()}%',
                  label: 'Vitórias',
                  accent: true,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: PeladaStatBox(
                  value: '${summary.firstPlaces}',
                  label: 'Vezes 1º',
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          for (final s in mine.take(3))
            PeladaSessionRow(
              saved: s,
              uid: userId,
              compact: true,
              onTap: () => openPeladaDetail(context, s.bookingId),
            ),
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton(
              key: const Key('public-profile-peladas-all'),
              onPressed: () => context.push(
                Uri(
                  path: AppRoutes.athletePeladas,
                  queryParameters: {'userId': userId},
                ).toString(),
              ),
              style: TextButton.styleFrom(
                foregroundColor: AppColors.brand,
                padding: EdgeInsets.zero,
                textStyle: AppTypography.soraRegular(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                ),
              ),
              child: const Text('Ver todas as peladas ›'),
            ),
          ),
        ],
      ),
    );
  }
}
