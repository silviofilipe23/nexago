import 'dart:io';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

import '../../../domain/tournament_create/tournament_create_draft.dart';
import '../../../domain/tournament_create/tournament_create_logic.dart';
import '../../../domain/tournament_create/tournament_create_providers.dart';
import '../tournament_create_navigation.dart';
import '../tournament_create_wizard_scaffold.dart';
import '../widgets/organizer_form_widgets.dart';

class TournamentCreateIdentityPage extends ConsumerStatefulWidget {
  const TournamentCreateIdentityPage({super.key});

  @override
  ConsumerState<TournamentCreateIdentityPage> createState() =>
      _TournamentCreateIdentityPageState();
}

class _TournamentCreateIdentityPageState
    extends ConsumerState<TournamentCreateIdentityPage> {
  late final TextEditingController _nameController;
  late final TextEditingController _descriptionController;

  @override
  void initState() {
    super.initState();
    final draft = ref.read(tournamentCreateDraftProvider);
    _nameController = TextEditingController(text: draft.name);
    _descriptionController = TextEditingController(text: draft.description);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      syncWizardStep(ref, TournamentCreateStep.identity);
    });
  }

  @override
  void dispose() {
    _nameController.dispose();
    _descriptionController.dispose();
    super.dispose();
  }

  Future<void> _pickCover() async {
    final picker = ImagePicker();
    final file = await picker.pickImage(
      source: ImageSource.gallery,
      maxWidth: 1920,
      maxHeight: 1080,
      imageQuality: 85,
    );
    if (file == null) return;
    ref.read(tournamentCreateWizardProvider.notifier).setCoverImagePath(file.path);
  }

  Future<void> _handleClose() => handleWizardClose(context, ref);

  @override
  Widget build(BuildContext context) {
    final draft = ref.watch(tournamentCreateDraftProvider);
    final canContinue =
        ref.watch(tournamentCreateCanContinueProvider(TournamentCreateStep.identity));

    return TournamentCreateWizardScaffold(
      step: TournamentCreateStep.identity,
      onClose: _handleClose,
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const OrganizerSectionLabel('ESPORTE'),
          const SizedBox(height: 8),
          DropdownButtonFormField<TournamentSport>(
            value: draft.sport,
            decoration: _fieldDecoration(context),
            items: [
              for (final sport in TournamentSport.values)
                DropdownMenuItem(
                  value: sport,
                  child: Text(sportLabel(sport)),
                ),
            ],
            onChanged: (value) {
              if (value != null) {
                ref.read(tournamentCreateWizardProvider.notifier).setSport(value);
              }
            },
          ),
          const SizedBox(height: 20),
          const OrganizerSectionLabel('NOME DO TORNEIO'),
          const SizedBox(height: 8),
          OrganizerTextField(
            controller: _nameController,
            hintText: 'Open Goiânia Beach',
            onChanged: (value) =>
                ref.read(tournamentCreateWizardProvider.notifier).setName(value),
          ),
          const SizedBox(height: 6),
          Text(
            'Aparece em destaque no card e na chave.',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: context.themeColors.onSurfaceMuted,
                ),
          ),
          const SizedBox(height: 20),
          const OrganizerSectionLabel('IMAGEM DE CAPA', optional: true),
          const SizedBox(height: 8),
          Material(
            color: context.themeColors.surfaceCard,
            borderRadius: BorderRadius.circular(14),
            clipBehavior: Clip.antiAlias,
            child: InkWell(
              onTap: _pickCover,
              child: Container(
                height: 140,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(
                    color: context.themeColors.onSurfaceMuted
                        .withValues(alpha: 0.2),
                  ),
                ),
                child: _buildCoverPreview(context, draft),
              ),
            ),
          ),
          const SizedBox(height: 20),
          const OrganizerSectionLabel('DESCRIÇÃO', optional: true),
          const SizedBox(height: 8),
          OrganizerTextField(
            controller: _descriptionController,
            hintText: 'Conte o que os atletas podem esperar…',
            maxLines: 4,
            onChanged: (value) => ref
                .read(tournamentCreateWizardProvider.notifier)
                .setDescription(value),
          ),
        ],
      ),
      footer: OrganizerWizardContinueButton(
        label: 'Continuar',
        enabled: canContinue,
        onPressed: () => goToNextCreateStep(
          context,
          ref,
          TournamentCreateStep.identity,
        ),
      ),
    );
  }

  Widget _buildCoverPreview(BuildContext context, TournamentCreateDraft draft) {
    if (draft.coverImagePath != null && draft.coverImagePath!.isNotEmpty) {
      return ClipRRect(
        borderRadius: BorderRadius.circular(14),
        child: Image.file(
          File(draft.coverImagePath!),
          fit: BoxFit.cover,
          width: double.infinity,
        ),
      );
    }

    final coverUrl = draft.coverImageUrl?.trim();
    if (coverUrl != null && coverUrl.isNotEmpty) {
      return ClipRRect(
        borderRadius: BorderRadius.circular(14),
        child: CachedNetworkImage(
          imageUrl: coverUrl,
          fit: BoxFit.cover,
          width: double.infinity,
          placeholder: (_, __) => const Center(
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
          errorWidget: (_, __, ___) => _coverPlaceholder(context),
        ),
      );
    }

    return _coverPlaceholder(context);
  }

  Widget _coverPlaceholder(BuildContext context) {
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Container(
          width: 44,
          height: 44,
          decoration: BoxDecoration(
            color: AppColors.brand.withValues(alpha: 0.12),
            borderRadius: BorderRadius.circular(12),
          ),
          child: const Icon(Icons.image_outlined, color: AppColors.brand),
        ),
        const SizedBox(height: 10),
        Text(
          'Adicionar imagem de capa',
          style: Theme.of(context).textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.w800,
              ),
        ),
        Text(
          'JPG ou PNG · proporção 16:9',
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: context.themeColors.onSurfaceMuted,
              ),
        ),
      ],
    );
  }

  InputDecoration _fieldDecoration(BuildContext context) {
    return InputDecoration(
      filled: true,
      fillColor: context.themeColors.surfaceCard,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(
          color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.15),
        ),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(
          color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.15),
        ),
      ),
    );
  }
}
