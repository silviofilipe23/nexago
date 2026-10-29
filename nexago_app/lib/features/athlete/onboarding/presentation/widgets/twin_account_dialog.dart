import 'package:flutter/material.dart';

import '../../data/twin_account_check_service.dart';

/// O que o atleta escolheu diante da outra conta com o mesmo WhatsApp.
enum TwinAccountChoice {
  /// Sai desta conta para entrar na que já existe.
  useOtherAccount,

  /// O número é compartilhado (ou a outra conta não é dele): segue o cadastro.
  continueHere,
}

/// `null` quando o diálogo é fechado sem escolha: o cadastro não é enviado.
Future<TwinAccountChoice?> showTwinAccountDialog(
  BuildContext context,
  PhoneInOtherAccount other,
) {
  final hint = other.hint;
  return showDialog<TwinAccountChoice>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: const Text('Você já tem uma conta?'),
      content: Text(
        'Este WhatsApp já está em outra conta do nexaGO'
        '${hint.isEmpty ? '' : ' ($hint)'}. '
        'Se ela é sua, entre com ela: assim seus torneios, ranking e '
        'inscrições ficam num lugar só.',
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(ctx, TwinAccountChoice.continueHere),
          child: const Text('Não é minha'),
        ),
        FilledButton(
          onPressed: () =>
              Navigator.pop(ctx, TwinAccountChoice.useOtherAccount),
          child: const Text('Entrar com ela'),
        ),
      ],
    ),
  );
}
