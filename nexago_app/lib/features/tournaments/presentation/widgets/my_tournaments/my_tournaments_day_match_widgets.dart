import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../../../../core/time/nexago_event_timezone.dart';
import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../domain/athlete_tournament_day_logic.dart';

class MyTournamentsNextMatchCard extends StatelessWidget {
  const MyTournamentsNextMatchCard({
    super.key,
    required this.nextMatch,
    required this.onTap,
  });

  final AthleteNextMatch nextMatch;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final match = nextMatch.match;
    final timeLabel = match.scheduleTime != null
        ? DateFormat('HH:mm', 'pt_BR')
            .format(toNexagoEventLocal(match.scheduleTime!))
        : 'Em breve';

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(16),
          child: Ink(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(16),
              color: AppColors.surfaceCard,
              border: Border.all(color: AppColors.brand.withValues(alpha: 0.35)),
            ),
            child: Row(
              children: [
                Icon(Icons.sports_tennis_rounded, color: AppColors.brand),
                SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'PRÓXIMA PARTIDA',
                        style: AppTypography.mono(
                          fontSize: 9,
                          fontWeight: FontWeight.w700,
                          color: AppColors.brand,
                          letterSpacing: 0.4,
                        ),
                      ),
                      SizedBox(height: 4),
                      Text(
                        '${nextMatch.tournamentName} · $timeLabel',
                        style: AppTypography.soraRegular(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: Colors.white,
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
                Icon(Icons.chevron_right_rounded, color: AppColors.brand),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class MyTournamentsCourtCallBanner extends StatelessWidget {
  const MyTournamentsCourtCallBanner({
    super.key,
    required this.nextMatch,
    required this.onTap,
  });

  final AthleteNextMatch nextMatch;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(16),
          child: Ink(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(16),
              gradient: LinearGradient(
                colors: [
                  AppColors.pending,
                  AppColors.pending.withValues(alpha: 0.85),
                ],
              ),
            ),
            child: Row(
              children: [
                const Icon(Icons.campaign_rounded, color: Colors.white, size: 28),
                SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'CHAMADA DE QUADRA',
                        style: AppTypography.mono(
                          fontSize: 9,
                          fontWeight: FontWeight.w800,
                          color: Colors.white,
                          letterSpacing: 0.5,
                        ),
                      ),
                      SizedBox(height: 4),
                      Text(
                        nextMatch.tournamentName,
                        style: AppTypography.soraRegular(
                          fontSize: 15,
                          fontWeight: FontWeight.w800,
                          color: Colors.white,
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
                Text(
                  'IR →',
                  style: AppTypography.mono(
                    fontSize: 10,
                    fontWeight: FontWeight.w800,
                    color: Colors.white,
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
