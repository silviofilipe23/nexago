import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../domain/tournament_registration_success_args.dart';

class TournamentRegistrationSuccessPage extends StatelessWidget {
  const TournamentRegistrationSuccessPage({
    super.key,
    required this.args,
  });

  final TournamentRegistrationSuccessArgs args;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.canvas,
      body: SafeArea(
        child: Column(
          children: [
            const SizedBox(height: 20),
            Text(
              'Inscrito',
              style: AppTypography.mono(
                fontSize: 14,
                fontWeight: FontWeight.w700,
                color: AppColors.onSurfaceMuted,
              ),
            ),
            const SizedBox(height: 20),
            const _SuccessOrb(),
            const SizedBox(height: 24),
            Text(
              'Ta na chave.',
              style: AppTypography.soraRegular(
                fontSize: 42,
                fontWeight: FontWeight.w800,
                color: AppColors.onSurface,
              ),
            ),
            const SizedBox(height: 10),
            Text(
              'Inscricao confirmada para sua dupla.',
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: AppColors.onSurfaceMuted,
                    fontWeight: FontWeight.w500,
                  ),
            ),
            const SizedBox(height: 24),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.all(18),
                decoration: BoxDecoration(
                  color: AppColors.surfaceCard,
                  borderRadius: BorderRadius.circular(18),
                  border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      args.tournamentName,
                      style: AppTypography.soraRegular(
                        fontSize: 30,
                        fontWeight: FontWeight.w700,
                        color: AppColors.onSurface,
                        height: 1.05,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      args.categoryName,
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                            color: AppColors.brand,
                            fontWeight: FontWeight.w800,
                          ),
                    ),
                    const SizedBox(height: 10),
                    Text(
                      'Comprovante #${args.registrationId.toUpperCase()}',
                      style: AppTypography.mono(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: AppColors.onSurfaceMuted,
                        letterSpacing: 0.5,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const Spacer(),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
              child: SizedBox(
                width: double.infinity,
                child: FilledButton(
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.brand,
                    foregroundColor: AppColors.black,
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16),
                    ),
                  ),
                  onPressed: () => context.go(
                    AppRoutes.tournamentDetail.replaceAll(
                      ':tournamentId',
                      args.tournamentId,
                    ),
                  ),
                  child: const Text(
                    'Ver minha chave',
                    style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SuccessOrb extends StatelessWidget {
  const _SuccessOrb();

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 180,
      height: 180,
      child: Stack(
        alignment: Alignment.center,
        children: [
          Container(
            width: 180,
            height: 180,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: AppColors.brand.withValues(alpha: 0.1),
            ),
          ),
          Container(
            width: 136,
            height: 136,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: AppColors.brand.withValues(alpha: 0.18),
            ),
          ),
          Container(
            width: 104,
            height: 104,
            decoration: const BoxDecoration(
              shape: BoxShape.circle,
              color: AppColors.brand,
            ),
            child: const Icon(
              Icons.check_rounded,
              size: 58,
              color: AppColors.black,
            ),
          ),
        ],
      ),
    );
  }
}

