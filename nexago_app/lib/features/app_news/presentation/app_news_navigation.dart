import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../home_banners/presentation/home_banner_navigation.dart';
import '../application/app_news_providers.dart';
import '../domain/app_news.dart';

/// O botão da novidade: marca "Já usou" e abre o destino. Reservar e Loja
/// são abas do shell — troca a aba e volta ao shell, senão a aba nova fica
/// escondida atrás de Novidades.
Future<void> openAppNewsFeature(
  BuildContext context,
  WidgetRef ref,
  AppNewsFeature feature,
) async {
  final destination = feature.destination;
  if (destination == null) return;
  unawaited(ref.read(appNewsUsedProvider.notifier).markUsed(feature.id));
  if (isShellTabDestination(destination)) {
    final navigator = Navigator.of(context);
    await openAppDestination(context, ref, destination);
    navigator.popUntil((route) => route.isFirst);
    return;
  }
  await openAppDestination(context, ref, destination, url: feature.url);
}
