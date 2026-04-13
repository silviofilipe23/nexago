import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/layout/app_scaffold.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../../core/ui/fade_slide_in.dart';
import '../../arenas/domain/arena_court.dart';
import '../domain/arena_providers.dart';
import 'widgets/arena_async_state.dart';
import 'widgets/arena_logout_button.dart';

class ArenaCourtsPage extends ConsumerWidget {
  const ArenaCourtsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final config = ref.watch(arenaModuleConfigProvider);
    final managed = ref.watch(managedArenaIdProvider);
    final courtsAsync = ref.watch(arenaManagedCourtsProvider);

    return AppScaffold(
      title: 'Quadras',
      actions: [
        IconButton(
          tooltip: 'Nova quadra',
          icon: const Icon(Icons.add),
          onPressed: () {
            final id = managed.valueOrNull;
            if (id == null || id.isEmpty) return;
            _openAddCourt(context, ref, arenaId: id);
          },
        ),
        const ArenaLogoutButton(),
      ],
      body: SafeArea(
        child: FadeSlideIn(
          child: managed.when(
            data: (arenaId) {
              if (arenaId == null || arenaId.isEmpty) {
                return _NoArenaMessage(configTitle: config.title);
              }
              return courtsAsync.when(
                data: (courts) {
                  if (courts.isEmpty) {
                    return _EmptyCourts(
                      configTitle: config.title,
                      onAdd: () => _openAddCourt(context, ref, arenaId: arenaId),
                    );
                  }
                  return ListView.separated(
                    padding: const EdgeInsets.fromLTRB(20, 12, 20, 28),
                    itemCount: courts.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 10),
                    itemBuilder: (context, index) {
                      final c = courts[index];
                      return staggeredFadeSlide(
                        index: index,
                        child: _CourtCard(
                          court: c,
                          onDelete: () => _confirmDelete(
                            context,
                            ref,
                            arenaId: arenaId,
                            court: c,
                          ),
                        ),
                      );
                    },
                  );
                },
                loading: () => const ArenaLoadingState(label: 'Carregando quadras...'),
                error: (e, _) => ArenaErrorState(message: 'Erro ao carregar quadras.\n$e'),
              );
            },
            loading: () => const ArenaLoadingState(label: 'Carregando arena...'),
            error: (e, _) => ArenaErrorState(message: '$e'),
          ),
        ),
      ),
    );
  }
}

Future<void> _openAddCourt(
  BuildContext context,
  WidgetRef ref, {
  required String arenaId,
}) async {
  final nameController = TextEditingController();
  String type = kCourtTypeOptions.first;

  final ok = await showDialog<bool>(
    context: context,
    builder: (ctx) {
      return StatefulBuilder(
        builder: (context, setState) {
          return AlertDialog(
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
            title: const Text('Nova quadra'),
            content: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  TextField(
                    controller: nameController,
                    textCapitalization: TextCapitalization.words,
                    decoration: const InputDecoration(
                      labelText: 'Nome',
                      hintText: 'Ex.: Quadra 1',
                      border: OutlineInputBorder(),
                    ),
                    autofocus: true,
                  ),
                  const SizedBox(height: 16),
                  InputDecorator(
                    decoration: const InputDecoration(
                      labelText: 'Tipo',
                      border: OutlineInputBorder(),
                    ),
                    child: DropdownButtonHideUnderline(
                      child: DropdownButton<String>(
                        value: type,
                        isExpanded: true,
                        isDense: true,
                        items: kCourtTypeOptions
                            .map(
                              (t) => DropdownMenuItem(value: t, child: Text(t)),
                            )
                            .toList(),
                        onChanged: (v) {
                          if (v != null) setState(() => type = v);
                        },
                      ),
                    ),
                  ),
                ],
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(ctx, false),
                child: const Text('Cancelar'),
              ),
              FilledButton(
                onPressed: () => Navigator.pop(ctx, true),
                style: FilledButton.styleFrom(backgroundColor: AppColors.brand),
                child: const Text('Salvar'),
              ),
            ],
          );
        },
      );
    },
  );

  if (ok != true || !context.mounted) return;

  try {
    await ref.read(courtServiceProvider).addCourt(
          arenaId: arenaId,
          name: nameController.text,
          type: type,
        );
    if (!context.mounted) return;
    showAppSnackBar(context, 'Quadra criada.');
  } on CourtServiceException catch (e) {
    if (!context.mounted) return;
    showAppSnackBar(context, e.message, isError: true);
  } catch (e) {
    if (!context.mounted) return;
    showAppSnackBar(context, 'Não foi possível salvar: $e', isError: true);
  }
}

Future<void> _confirmDelete(
  BuildContext context,
  WidgetRef ref, {
  required String arenaId,
  required ArenaCourt court,
}) async {
  final ok = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      title: const Text('Remover quadra?'),
      content: Text(
        '“${court.name}” será removida. Horários já vinculados a esta quadra podem ficar inconsistentes.',
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(ctx, false),
          child: const Text('Cancelar'),
        ),
        FilledButton(
          onPressed: () => Navigator.pop(ctx, true),
          style: FilledButton.styleFrom(backgroundColor: const Color(0xFFB71C1C)),
          child: const Text('Remover'),
        ),
      ],
    ),
  );

  if (ok != true || !context.mounted) return;

  try {
    await ref.read(courtServiceProvider).deleteCourt(
          arenaId: arenaId,
          courtId: court.id,
        );
    if (!context.mounted) return;
    showAppSnackBar(context, 'Quadra removida.');
  } on CourtServiceException catch (e) {
    if (!context.mounted) return;
    showAppSnackBar(context, e.message, isError: true);
  } catch (e) {
    if (!context.mounted) return;
    showAppSnackBar(context, 'Não foi possível remover: $e', isError: true);
  }
}

class _NoArenaMessage extends StatelessWidget {
  const _NoArenaMessage({required this.configTitle});

  final String configTitle;

  @override
  Widget build(BuildContext context) {
    return ArenaEmptyState(
      title: 'Arena não encontrada',
      message: 'Nenhuma arena vinculada ao seu usuário como gestor de $configTitle.',
      icon: Icons.storefront_outlined,
    );
  }
}

class _EmptyCourts extends StatelessWidget {
  const _EmptyCourts({
    required this.configTitle,
    required this.onAdd,
  });

  final String configTitle;
  final VoidCallback onAdd;

  @override
  Widget build(BuildContext context) {
    return ArenaEmptyState(
      title: 'Nenhuma quadra cadastrada',
      message: 'Adicione quadras para $configTitle e configure horários na agenda.',
      icon: Icons.sports_tennis_outlined,
      action: FilledButton.icon(
        onPressed: onAdd,
        icon: const Icon(Icons.add),
        label: const Text('Adicionar quadra'),
        style: FilledButton.styleFrom(backgroundColor: AppColors.brand),
      ),
    );
  }
}

class _CourtCard extends StatelessWidget {
  const _CourtCard({
    required this.court,
    required this.onDelete,
  });

  final ArenaCourt court;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final typeLabel = court.type ?? '—';

    return Material(
      color: theme.colorScheme.surface,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: theme.colorScheme.outline.withValues(alpha: 0.12)),
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 8, 12),
        child: Row(
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: theme.colorScheme.primaryContainer.withValues(alpha: 0.5),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(
                Icons.grid_view_rounded,
                color: theme.colorScheme.primary,
              ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    court.name,
                    style: theme.textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    typeLabel,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onSurface.withValues(alpha: 0.65),
                    ),
                  ),
                ],
              ),
            ),
            IconButton(
              tooltip: 'Remover',
              icon: Icon(
                Icons.delete_outline_rounded,
                color: theme.colorScheme.error,
              ),
              onPressed: onDelete,
            ),
          ],
        ),
      ),
    );
  }
}
