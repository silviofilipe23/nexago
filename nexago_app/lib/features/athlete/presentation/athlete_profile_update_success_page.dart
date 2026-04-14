import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/routes.dart';
import '../../../core/ui/success_page.dart';

/// Confirmação após salvar o perfil do atleta.
class AthleteProfileUpdateSuccessPage extends StatelessWidget {
  const AthleteProfileUpdateSuccessPage({super.key});

  @override
  Widget build(BuildContext context) {
    final goToProfileOnShell = Uri(
      path: AppRoutes.discover,
      queryParameters: const {'tab': 'profile'},
    ).toString();
    return SuccessPage(
      title: 'Perfil atualizado',
      message: 'Suas alterações de atleta foram salvas com sucesso.',
      primaryActionLabel: 'Voltar ao perfil',
      onPrimaryAction: () => context.go(goToProfileOnShell),
    );
  }
}
