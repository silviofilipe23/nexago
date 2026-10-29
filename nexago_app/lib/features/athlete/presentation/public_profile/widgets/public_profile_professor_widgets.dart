import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_theme_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../domain/athlete_display_name.dart';
import '../../../domain/athlete_profile.dart';
import '../../../domain/athlete_public_profile_models.dart';
import '../../../domain/athlete_public_profile_providers.dart';
import '../../../domain/public_profile_game_summary.dart';
import '../../widgets/athlete_profile_avatar.dart';

/// Regra fixa da visão do professor (I2/I6).
const kPublicProfileProfessorRule =
    'Ser professor não libera dados que o atleta ocultou. Você vê o mesmo '
    'que qualquer pessoa no app.';

/// Faixa "visto como professor" logo abaixo do cabeçalho (I2).
class PublicProfileProfessorBanner extends StatelessWidget {
  const PublicProfileProfessorBanner({super.key});

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Padding(
      key: const Key('public-profile-professor-banner'),
      padding: const EdgeInsets.fromLTRB(20, 14, 20, 0),
      child: Row(
        children: [
          Icon(
            Icons.visibility_outlined,
            size: 15,
            color: colors.onSurfaceMuted,
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              'PERFIL PÚBLICO · VISTO COMO PROFESSOR',
              style: AppTypography.mono(
                fontSize: 10,
                fontWeight: FontWeight.w700,
                color: colors.onSurfaceMuted,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Números de relance + nota "para o professor" (I2 · `PpfProfNote`).
///
/// A nota usa só os resultados públicos; a ação leva à avaliação técnica.
class PublicProfileProfessorSummary extends ConsumerWidget {
  const PublicProfileProfessorSummary({
    super.key,
    required this.userId,
    required this.ranking,
    this.onEvaluate,
  });

  final String userId;
  final AthletePublicRankingSnapshot ranking;
  final VoidCallback? onEvaluate;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final history =
        ref.watch(athletePublicMatchHistoryProvider(userId)).valueOrNull;
    final summary = summarizePublicProfileGames(
      history: history,
      ranking: ranking,
    );
    final colors = context.themeColors;
    final rate = summary.winRatePercent;
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          PublicProfileStatGrid(
            key: const Key('public-profile-professor-stats'),
            items: [
              (history == null ? '—' : '${summary.matches}', 'Jogos', null),
              (rate == null ? '—' : '$rate%', 'Vitórias', colors.win),
              (
                summary.hasRank ? '#${summary.rank}' : '—',
                'Ranking',
                colors.brandText,
              ),
              (history == null ? '—' : '${summary.tournaments}', 'Torneios',
                  null),
            ],
          ),
          if (history != null) ...[
            const SizedBox(height: 12),
            PublicProfileProfessorNote(
              key: const Key('public-profile-professor-note'),
              text: publicProfileProfessorNote(summary),
              ctaLabel: onEvaluate == null ? null : 'Avaliar aluno',
              onCta: onEvaluate,
            ),
          ],
        ],
      ),
    );
  }
}

/// Grade de 4 números (Jogos · Vitórias · Ranking · Torneios).
class PublicProfileStatGrid extends StatelessWidget {
  const PublicProfileStatGrid({super.key, required this.items});

  final List<(String value, String label, Color? color)> items;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: colors.surfaceRaised),
      ),
      child: IntrinsicHeight(
        child: Row(
          children: [
            for (var i = 0; i < items.length; i++) ...[
              if (i > 0)
                VerticalDivider(
                  width: 1,
                  thickness: 1,
                  color: colors.surfaceRaised,
                ),
              Expanded(
                child: Padding(
                  padding:
                      const EdgeInsets.symmetric(vertical: 12, horizontal: 4),
                  child: Column(
                    children: [
                      Text(
                        items[i].$1,
                        style: AppTypography.soraRegular(
                          fontSize: 18,
                          fontWeight: FontWeight.w800,
                          color: items[i].$3 ?? colors.onSurface,
                        ),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        items[i].$2.toUpperCase(),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.mono(
                          fontSize: 10,
                          fontWeight: FontWeight.w600,
                          color: colors.onSurfaceMuted,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Caixa laranja "PARA O PROFESSOR · SÓ VOCÊ VÊ".
class PublicProfileProfessorNote extends StatelessWidget {
  const PublicProfileProfessorNote({
    super.key,
    required this.text,
    this.ctaLabel,
    this.onCta,
  });

  final String text;
  final String? ctaLabel;
  final VoidCallback? onCta;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final cta = ctaLabel;
    return Material(
      color: AppColors.brand.withValues(alpha: 0.08),
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onCta,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: AppColors.brand.withValues(alpha: 0.3)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(Icons.bolt_rounded, size: 15, color: colors.brandText),
                  const SizedBox(width: 6),
                  Text(
                    'PARA O PROFESSOR · SÓ VOCÊ VÊ',
                    style: AppTypography.mono(
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      color: colors.brandText,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                text,
                style: AppTypography.soraRegular(
                  fontSize: 12,
                  fontWeight: FontWeight.w500,
                  color: colors.onSurface,
                ).copyWith(height: 1.5),
              ),
              if (cta != null) ...[
                const SizedBox(height: 8),
                Row(
                  children: [
                    Text(
                      cta,
                      style: AppTypography.soraRegular(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: colors.brandText,
                      ),
                    ),
                    const SizedBox(width: 4),
                    Icon(
                      Icons.chevron_right_rounded,
                      size: 16,
                      color: colors.brandText,
                    ),
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// Linha discreta para uma seção que o atleta escondeu.
class PublicProfileHiddenSection extends StatelessWidget {
  const PublicProfileHiddenSection({super.key, required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Row(
      children: [
        Icon(Icons.lock_outline_rounded, size: 14, color: colors.onSurfaceMuted),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            message,
            style: AppTypography.soraRegular(
              fontSize: 12,
              fontWeight: FontWeight.w500,
              color: colors.onSurfaceMuted,
            ),
          ),
        ),
      ],
    );
  }
}

/// I6 · Perfil privado visto pelo professor: só a identidade pública (nome,
/// apelido, foto — as mesmas do espelho `public_profiles`) e nenhum número.
class PublicProfileRestrictedView extends StatelessWidget {
  const PublicProfileRestrictedView({
    super.key,
    required this.profile,
    required this.onBack,
  });

  final AthleteProfile profile;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final name = athleteDisplayName(profile);
    final firstName = name.trim().split(RegExp(r'\s+')).first;
    final handle = athletePublicHandle(profile);
    final sport = profile.sport.trim();
    final sub = [
      if (handle != null) handle,
      if (sport.isNotEmpty) sport,
    ].join(' · ');
    return SafeArea(
      key: const Key('public-profile-restricted'),
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 4, 20, 32),
        children: [
          Align(
            alignment: Alignment.centerLeft,
            child: IconButton(
              onPressed: onBack,
              icon: const Icon(Icons.arrow_back_rounded),
            ),
          ),
          Text(
            'PERFIL PÚBLICO · RESTRITO',
            style: AppTypography.mono(
              fontSize: 10,
              fontWeight: FontWeight.w700,
              color: colors.onSurfaceMuted,
            ),
          ),
          const SizedBox(height: 10),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: colors.surfaceCard,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: colors.surfaceRaised),
            ),
            child: Row(
              children: [
                AthleteProfileAvatar(
                  size: 46,
                  initials: athleteInitialsFromName(name),
                  imageUrl: profile.avatarUrl,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        name,
                        style: AppTypography.soraRegular(
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                          color: colors.onSurface,
                        ),
                      ),
                      if (sub.isNotEmpty)
                        Text(
                          sub,
                          style: AppTypography.soraRegular(
                            fontSize: 11.5,
                            fontWeight: FontWeight.w500,
                            color: colors.onSurfaceMuted,
                          ),
                        ),
                    ],
                  ),
                ),
                Icon(
                  Icons.lock_outline_rounded,
                  size: 17,
                  color: colors.onSurfaceMuted,
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          const PublicProfileStatGrid(
            items: [
              ('—', 'Jogos', null),
              ('—', 'Vitórias', null),
              ('—', 'Ranking', null),
              ('—', 'Torneios', null),
            ],
          ),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.fromLTRB(18, 22, 18, 22),
            decoration: BoxDecoration(
              color: colors.surfaceCard,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: colors.outline.withValues(alpha: 0.5)),
            ),
            child: Column(
              children: [
                Icon(
                  Icons.visibility_off_outlined,
                  size: 22,
                  color: colors.onSurfaceMuted,
                ),
                const SizedBox(height: 10),
                Text(
                  'Perfil privado',
                  style: AppTypography.soraRegular(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: colors.onSurface,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  '$firstName escolheu deixar o perfil privado: jogos, '
                  'torneios, ranking e conquistas ficam ocultos.',
                  textAlign: TextAlign.center,
                  style: AppTypography.soraRegular(
                    fontSize: 12,
                    fontWeight: FontWeight.w500,
                    color: colors.onSurfaceMuted,
                  ).copyWith(height: 1.5),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          const PublicProfileHiddenSection(
            message: kPublicProfileProfessorRule,
          ),
        ],
      ),
    );
  }
}
