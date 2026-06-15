import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

import '../../domain/category_ops/category_ops_models.dart';
import '../../domain/tournament_ops/tournament_ops_providers.dart';
import '../tournament_create/widgets/organizer_form_widgets.dart';
import 'organizer_tournament_navigation.dart';

class OrganizerCategoryFormatPage extends ConsumerStatefulWidget {
  const OrganizerCategoryFormatPage({
    super.key,
    required this.tournamentId,
    required this.categoryId,
  });

  final String tournamentId;
  final String categoryId;

  @override
  ConsumerState<OrganizerCategoryFormatPage> createState() =>
      _OrganizerCategoryFormatPageState();
}

class _OrganizerCategoryFormatPageState
    extends ConsumerState<OrganizerCategoryFormatPage> {
  bool _winnersAdvantage = true;
  String _phaseBestOf = 'md3';
  bool _finalBestOf5 = true;
  bool _thirdPlace = false;

  Future<void> _saveAndContinue() async {
    final ops = await ref
        .read(organizerCategoryOpsRepositoryProvider)
        .getCategoryOps(
          tournamentId: widget.tournamentId,
          categoryId: widget.categoryId,
        );
    await ref.read(organizerCategoryOpsRepositoryProvider).saveCategoryOps(
          tournamentId: widget.tournamentId,
          categoryId: widget.categoryId,
          state: CategoryOpsState(
            seeds: ops.seeds,
            seedByRanking: ops.seedByRanking,
            bracketStatus: ops.bracketStatus,
            bracketFormatOverride: 'double_elimination',
            winnersAdvantage: _winnersAdvantage,
            phaseBestOf: _phaseBestOf,
            finalBestOf5: _finalBestOf5,
            thirdPlaceEnabled: _thirdPlace,
            groupsPreview: ops.groupsPreview,
          ),
        );
    if (!mounted) return;
    pushOrganizerCategoryGenerateBracket(
      GoRouter.of(context),
      tournamentId: widget.tournamentId,
      categoryId: widget.categoryId,
      format: 'double_elimination',
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      appBar: AppBar(
        title: const Text('Formato — dupla eliminatória'),
        backgroundColor: context.themeColors.canvas,
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          const OrganizerSectionLabel('SISTEMA DE DISPUTA'),
          const SizedBox(height: 8),
          OrganizerRadioOptionCard(
            title: 'Dupla eliminatória',
            subtitle: 'Chave principal + repescagem',
            selected: true,
            onTap: () {},
          ),
          const SizedBox(height: 16),
          SwitchListTile(
            title: const Text('Vantagem na grande final'),
            value: _winnersAdvantage,
            onChanged: (v) => setState(() => _winnersAdvantage = v),
          ),
          SwitchListTile(
            title: const Text('Final em MD5'),
            value: _finalBestOf5,
            onChanged: (v) => setState(() => _finalBestOf5 = v),
          ),
          SwitchListTile(
            title: const Text('Disputa de 3º lugar'),
            value: _thirdPlace,
            onChanged: (v) => setState(() => _thirdPlace = v),
          ),
        ],
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: FilledButton(
            onPressed: _saveAndContinue,
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.brand,
              minimumSize: const Size.fromHeight(48),
            ),
            child: const Text('Continuar para gerar chave'),
          ),
        ),
      ),
    );
  }
}
