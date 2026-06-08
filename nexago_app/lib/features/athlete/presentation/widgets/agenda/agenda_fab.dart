import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../domain/athlete_shell_providers.dart';

class AgendaFab extends ConsumerWidget {
  const AgendaFab({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: FloatingActionButton.extended(
        onPressed: () {
          ref.read(athleteShellTabIndexProvider.notifier).state =
              athleteShellReservarTabIndex;
        },
        backgroundColor: AppColors.brand,
        foregroundColor: AppColors.black,
        elevation: 4,
        icon: const Icon(Icons.add_rounded),
        label: const Text(
          'Nova partida',
          style: TextStyle(fontWeight: FontWeight.w800),
        ),
      ),
    );
  }
}
