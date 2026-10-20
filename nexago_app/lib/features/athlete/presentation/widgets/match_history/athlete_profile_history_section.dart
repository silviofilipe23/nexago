import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../../core/router/routes.dart';
import '../../../../../core/theme/app_theme_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../../arenas/domain/booking_result_record.dart';
import '../../../../arenas/domain/booking_result_record_providers.dart';
import '../../../../arenas/domain/pelada.dart';
import '../../../../arenas/presentation/pelada_analytics.dart';
import '../../../../arenas/presentation/peladas_list.dart';
import '../../../../arenas/presentation/widgets/pelada/pelada_widgets.dart';
import '../../../domain/match_history/athlete_match_history_providers.dart';
import '../athlete_profile_section_header.dart';
import '../athlete_profile_skeleton.dart';
import 'match_history_match_card.dart';

/// "Histórico" de Meu perfil: as três últimas partidas de torneio e, num
/// bloco abaixo, as três últimas peladas confirmadas (como a aba Peladas do
/// perfil público, 00d). Pelada não entra em ranking, XP nem nos números do
/// perfil — aqui ela só aparece.
class AthleteProfileHistorySection extends ConsumerWidget {
  const AthleteProfileHistorySection({
    super.key,
    required this.onViewAll,
  });

  final VoidCallback onViewAll;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final bundleAsync = ref.watch(currentAthleteMatchHistoryBundleProvider);
    final peladasAsync = ref.watch(myBookingResultsProvider);
    final uid = ref.watch(bookingResultUidProvider);

    final matches = [...?bundleAsync.valueOrNull?.matches]
      ..sort((a, b) => b.playedAt.compareTo(a.playedAt));
    final items = matches.take(3).toList();
    // Pendente ou contestada ainda não é resultado.
    final peladas = peladasOf(
      [
        for (final s
            in peladasAsync.valueOrNull ?? const <SavedBookingResult>[])
          if (s.isConfirmed) s,
      ],
      uid,
    ).take(3).toList();

    final header = AthleteProfileSectionHeader(
      title: 'Histórico',
      trailing: 'VER TUDO',
      onTrailingTap: onViewAll,
      trailingBrand: true,
    );

    bool waiting(AsyncValue<Object?> a) => !a.hasValue && !a.hasError;
    if (waiting(bundleAsync) || (items.isEmpty && waiting(peladasAsync))) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          header,
          const SizedBox(height: 10),
          const AthleteProfileHistorySkeleton(),
        ],
      );
    }
    if (items.isEmpty && peladas.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        header,
        const SizedBox(height: 10),
        ...items.map(
          (m) => MatchHistoryMatchCard(
            match: m,
            compact: true,
            onTap: () => context.pushNamed(
              AppRouteNames.athleteMatchDetail,
              pathParameters: {'matchId': m.id},
            ),
          ),
        ),
        if (peladas.isNotEmpty) ...[
          if (items.isNotEmpty) const SizedBox(height: 8),
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Text(
              'PELADAS',
              key: const Key('profile-history-peladas-label'),
              style: AppTypography.mono(
                fontSize: 10,
                letterSpacing: 1.4,
                color: PeladaStyle.dim(context.themeColors),
              ),
            ),
          ),
          for (final s in peladas)
            PeladaSessionRow(
              saved: s,
              uid: uid,
              compact: true,
              onTap: () {
                logPelada(ref, (a) => a.logPeladaOpened('my_profile'));
                openPeladaDetail(context, s.bookingId);
              },
            ),
        ],
      ],
    );
  }
}
