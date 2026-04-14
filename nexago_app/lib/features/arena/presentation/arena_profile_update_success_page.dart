import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/routes.dart';
import '../../../core/ui/success_page.dart';

/// Confirmação após salvar o perfil da arena (navegação via [GoRouter]).
class ArenaProfileUpdateSuccessPage extends StatelessWidget {
  const ArenaProfileUpdateSuccessPage({super.key});

  @override
  Widget build(BuildContext context) {
    return SuccessPage(
      title: 'Perfil atualizado',
      message: 'Suas alterações foram salvas com sucesso.',
      primaryActionLabel: 'Voltar ao perfil',
      onPrimaryAction: () => context.go(AppRoutes.arenaProfile),
    );
  }
}
