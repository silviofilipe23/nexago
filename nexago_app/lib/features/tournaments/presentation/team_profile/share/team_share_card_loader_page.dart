import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../../core/layout/nexa_app_bar.dart';
import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_theme_colors.dart';
import '../../../../athlete/domain/athlete_public_profile_providers.dart';
import '../../../domain/team_profile/team_public_profile_models.dart';
import '../../../domain/team_profile/team_public_profile_providers.dart';
import '../../../domain/team_profile/team_share_card.dart';
import 'team_share_card_page.dart';

/// Abre o card de uma equipe que a tela de origem não carregou — a de Ranking
/// só tem a linha da lista. [adapt] ajusta o card pronto (a posição do
/// recorte do ranking no lugar da do perfil).
Future<void> openTeamShareCardFor(
  BuildContext context, {
  required String teamId,
  TeamShareCardStyle style = TeamShareCardStyle.profile,
  TeamShareCardData Function(TeamShareCardData card)? adapt,
}) {
  return Navigator.of(context, rootNavigator: true).push(
    MaterialPageRoute<void>(
      builder: (_) => TeamShareCardLoaderPage(
        teamId: teamId,
        initialStyle: style,
        adapt: adapt,
      ),
    ),
  );
}

/// Carrega perfil e histórico da equipe (os mesmos providers do perfil
/// público) e mostra o card. O histórico com falha sai com zeros, como no
/// perfil; a equipe que não carrega vira mensagem.
class TeamShareCardLoaderPage extends ConsumerWidget {
  const TeamShareCardLoaderPage({
    super.key,
    required this.teamId,
    this.initialStyle = TeamShareCardStyle.profile,
    this.adapt,
  });

  final String teamId;
  final TeamShareCardStyle initialStyle;
  final TeamShareCardData Function(TeamShareCardData card)? adapt;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profileAsync = ref.watch(teamPublicProfileProvider(teamId));
    final historyAsync = ref.watch(teamMatchHistoryProvider(teamId));
    final profile = profileAsync.valueOrNull;

    if (profileAsync.hasError || (!profileAsync.isLoading && profile == null)) {
      return const _Frame(
        child: _Message('Não foi possível carregar a equipe.'),
      );
    }
    if (profile == null || historyAsync.isLoading) {
      return const _Frame(
        child: Center(
          child: CircularProgressIndicator(color: AppColors.brand),
        ),
      );
    }
    if (profile.isLookingForPartner) {
      return const _Frame(
        child: _Message('A dupla ainda está sem parceiro.'),
      );
    }

    final card = teamShareCardDataFromHistory(
      profile: profile,
      history: historyAsync.valueOrNull ?? const TeamMatchHistoryBundle(),
      // O ranking de cada atleta chega depois sem segurar o card: a linha da
      // ficha aparece quando vier.
      memberDetails: {
        for (final member in profile.members)
          if (ref.watch(athletePublicRankingProvider(member.uid)).valueOrNull
              case final ranking?)
            member.uid: teamShareMemberRankDetail(ranking),
      },
    );
    return TeamShareCardPage(
      data: adapt?.call(card) ?? card,
      initialStyle: initialStyle,
    );
  }
}

class _Frame extends StatelessWidget {
  const _Frame({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Scaffold(
      backgroundColor: colors.canvas,
      appBar: NexaAppBar(
        backgroundColor: colors.canvas,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        centerTitle: true,
        title: Text(
          'Compartilhar',
          style: Theme.of(context).textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w800,
                color: colors.onSurface,
              ),
        ),
      ),
      body: child,
    );
  }
}

class _Message extends StatelessWidget {
  const _Message(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Text(
          text,
          textAlign: TextAlign.center,
          style: TextStyle(color: context.themeColors.onSurfaceMuted),
        ),
      ),
    );
  }
}
