import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/links/open_external_url.dart';
import '../../../core/router/routes.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../athlete/domain/athlete_shell_providers.dart';
import '../domain/home_banner.dart';

/// Ícone do destino: no compacto e no card sem imagem.
IconData homeBannerIcon(HomeBannerDestination destination) =>
    switch (destination) {
      HomeBannerDestination.reservar => Icons.add_circle_outline_rounded,
      HomeBannerDestination.boraJogar => Icons.sports_volleyball_rounded,
      HomeBannerDestination.peladas => Icons.scoreboard_outlined,
      HomeBannerDestination.torneios => Icons.emoji_events_outlined,
      HomeBannerDestination.ranking => Icons.leaderboard_outlined,
      HomeBannerDestination.duplas => Icons.people_alt_outlined,
      HomeBannerDestination.treinos => Icons.sports_rounded,
      HomeBannerDestination.aulas => Icons.school_outlined,
      HomeBannerDestination.loja => Icons.storefront_outlined,
      HomeBannerDestination.indicar => Icons.card_giftcard_rounded,
      HomeBannerDestination.missoes => Icons.flag_outlined,
      HomeBannerDestination.minhasReservas => Icons.event_note_outlined,
      HomeBannerDestination.creditosChuva =>
        Icons.account_balance_wallet_outlined,
      HomeBannerDestination.url => Icons.open_in_new_rounded,
    };

/// Reservar e Loja são abas do shell: quem abre de uma tela empilhada (ex.:
/// Novidades) volta ao shell antes, senão a troca de aba fica escondida.
bool isShellTabDestination(HomeBannerDestination destination) =>
    destination == HomeBannerDestination.reservar ||
    destination == HomeBannerDestination.loja;

/// Abre o destino do banner. Reservar e Loja são abas do shell (troca de aba
/// em vez de empilhar rota, como os atalhos); link externo vai pro navegador.
Future<void> openHomeBannerDestination(
  BuildContext context,
  WidgetRef ref,
  HomeBanner banner,
) =>
    openAppDestination(context, ref, banner.destination, url: banner.url);

/// Abre um destino com as chaves do banner (também usado pelas Novidades).
Future<void> openAppDestination(
  BuildContext context,
  WidgetRef ref,
  HomeBannerDestination destination, {
  String? url,
}) async {
  void goToTab(int index) =>
      ref.read(athleteShellTabIndexProvider.notifier).state = index;

  final route = switch (destination) {
    HomeBannerDestination.boraJogar => AppRouteNames.friendlyMatchHub,
    HomeBannerDestination.peladas => AppRouteNames.athletePeladas,
    HomeBannerDestination.torneios => AppRouteNames.tournamentDiscoveryList,
    HomeBannerDestination.ranking => AppRouteNames.athleteRanking,
    HomeBannerDestination.duplas => AppRouteNames.teamDiscover,
    HomeBannerDestination.treinos => AppRouteNames.athleteTrainings,
    HomeBannerDestination.aulas => AppRouteNames.classDirectory,
    HomeBannerDestination.indicar => AppRouteNames.athleteReferral,
    HomeBannerDestination.missoes => AppRouteNames.athleteQuest,
    HomeBannerDestination.minhasReservas => AppRouteNames.myBookings,
    HomeBannerDestination.creditosChuva => AppRouteNames.athleteWeatherCredits,
    HomeBannerDestination.reservar ||
    HomeBannerDestination.loja ||
    HomeBannerDestination.url =>
      null,
  };
  if (route != null) {
    context.pushNamed(route);
    return;
  }
  switch (destination) {
    case HomeBannerDestination.reservar:
      goToTab(athleteShellReservarTabIndex);
    case HomeBannerDestination.loja:
      goToTab(athleteShellStoreTabIndex);
    case HomeBannerDestination.url:
      final opened = await openExternalUrl(url ?? '');
      if (!opened && context.mounted) {
        showAppSnackBar(context, 'Não foi possível abrir o link.',
            isError: true);
      }
    default:
      break;
  }
}
