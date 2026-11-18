import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../athlete/domain/athlete_profile_providers.dart';

/// Abre o contato do atleta: WhatsApp quando há celular, ligação quando o
/// número é curto, e-mail como último recurso. Usado pelo detail da reserva
/// e pelo botão "Conversar" do card da aba Reservas.
Future<void> contactArenaAthlete(
  BuildContext context,
  WidgetRef ref,
  String athleteId,
) async {
  final messenger = ScaffoldMessenger.of(context);
  final profile = ref.read(athleteProfileByIdProvider(athleteId)).valueOrNull;
  final email = await ref.read(athleteUserEmailProvider(athleteId).future);
  final phone = profile?.phoneNumber?.trim();

  Uri? uri;
  if (phone != null && phone.isNotEmpty) {
    final digits = String.fromCharCodes(
      phone.runes.where((r) => r >= 0x30 && r <= 0x39),
    );
    if (digits.length >= 10) {
      var n = digits;
      if (n.startsWith('0')) n = n.substring(1);
      if (!n.startsWith('55') && n.length <= 11) {
        n = '55$n';
      }
      uri = Uri.parse('https://wa.me/$n');
    } else {
      uri = Uri(scheme: 'tel', path: phone);
    }
  }
  uri ??= (email != null && email.isNotEmpty)
      ? Uri(
          scheme: 'mailto',
          path: email,
          queryParameters: {'subject': 'Reserva — Nexago'},
        )
      : null;

  if (uri == null) {
    messenger.showSnackBar(
      const SnackBar(content: Text('Contato do atleta indisponível.')),
    );
    return;
  }

  final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
  if (!ok && context.mounted) {
    messenger.showSnackBar(
      const SnackBar(content: Text('Não foi possível abrir o app de contato.')),
    );
  }
}
