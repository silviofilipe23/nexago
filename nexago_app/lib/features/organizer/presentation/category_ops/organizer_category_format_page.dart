import 'package:flutter/material.dart';
import 'package:nexago_app/core/layout/nexa_app_bar.dart';
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
  final String _phaseBestOf = 'md3';

  Future<void> _saveAndContinue() async {
    final ops = await ref
        .read(organizerCategoryOpsRepositoryProvider)
        .getCategoryOps(
          tournamentId: widget.tournamentId,
          categoryId: widget.categoryId,
        );
    await ref
        .read(organizerCategoryOpsRepositoryProvider)
        .saveCategoryOps(
          tournamentId: widget.tournamentId,
          categoryId: widget.categoryId,
          state: CategoryOpsState(
            seeds: ops.seeds,
            seedByRanking: ops.seedByRanking,
            bracketStatus: ops.bracketStatus,
            bracketFormatOverride: 'double_elimination',
            winnersAdvantage: _winnersAdvantage,
            phaseBestOf: _phaseBestOf,
            // Pontuação é sempre melhor-de-3 (3º set decisivo até 15);
            // MD5 não é suportado pelo motor de placar.
            finalBestOf5: false,
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
      appBar: NexaAppBar(
        forceMaterial: true,
        backgroundColor: context.themeColors.canvas,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        titleSpacing: 8,
        leading: Material(
          color: context.themeColors.surfaceRaised,
          borderRadius: BorderRadius.circular(12),
          child: InkWell(
            onTap: () => context.pop(),
            borderRadius: BorderRadius.circular(12),
            child: SizedBox(
              width: 40,
              height: 40,
              child: Icon(
                Icons.arrow_back_ios_new_rounded,
                size: 18,
                color: context.themeColors.onSurface,
              ),
            ),
          ),
        ),
        title: const Text(
          'Formato — dupla eliminatória',
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
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
