import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/ui/app_snackbar.dart';

import '../../../data/organizer_category_ops_service.dart';
import '../../../domain/category_ops/category_ops_logic.dart';
import '../../../domain/category_ops/category_ops_models.dart';
import '../../../domain/tournament_ops/tournament_ops_providers.dart';

Future<void> showOrganizerTeamActionsSheet(
  BuildContext context, {
  required String tournamentId,
  required String categoryId,
  required OrganizerCategoryTeamRow team,
}) {
  return showModalBottomSheet<void>(
    context: context,
    backgroundColor: context.themeColors.surfaceCard,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (context) => _OrganizerTeamActionsSheet(
      tournamentId: tournamentId,
      categoryId: categoryId,
      team: team,
    ),
  );
}

class _OrganizerTeamActionsSheet extends ConsumerStatefulWidget {
  const _OrganizerTeamActionsSheet({
    required this.tournamentId,
    required this.categoryId,
    required this.team,
  });

  final String tournamentId;
  final String categoryId;
  final OrganizerCategoryTeamRow team;

  @override
  ConsumerState<_OrganizerTeamActionsSheet> createState() =>
      _OrganizerTeamActionsSheetState();
}

class _OrganizerTeamActionsSheetState
    extends ConsumerState<_OrganizerTeamActionsSheet> {
  bool _busy = false;

  Future<void> _run(Future<void> Function() action, String success) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await action();
      if (mounted) {
        Navigator.pop(context);
        showAppSnackBar(context, success);
      }
    } catch (e) {
      if (mounted) showAppSnackBar(context, '$e', isError: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final service = ref.read(organizerCategoryOpsServiceProvider);
    final team = widget.team;

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              team.displayName,
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
            ),
            const SizedBox(height: 12),
            ListTile(
              leading: const Icon(Icons.emoji_events_outlined),
              title: const Text('Definir cabeça de chave'),
              onTap: _busy
                  ? null
                  : () {
                      Navigator.pop(context);
                      // seeding page handles this
                    },
            ),
            if (team.status == OrganizerTeamRegistrationStatus.pending)
              ListTile(
                leading: const Icon(Icons.payments_outlined),
                title: const Text('Confirmar pagamento'),
                onTap: _busy
                    ? null
                    : () => _run(
                          () => service.confirmRegistrationPayment(
                            registrationId: team.registrationId,
                          ),
                          'Pagamento confirmado.',
                        ),
              ),
            ListTile(
              leading: const Icon(Icons.chat_bubble_outline_rounded),
              title: const Text('Enviar mensagem'),
              onTap: _busy ? null : () => Navigator.pop(context),
            ),
            if (team.status == OrganizerTeamRegistrationStatus.pending)
              ListTile(
                leading: const Icon(Icons.notifications_active_outlined),
                title: const Text('Cobrar inscrição'),
                onTap: _busy
                    ? null
                    : () => _run(
                          () => service.resendRegistrationPayment(
                            registrationId: team.registrationId,
                          ),
                          'Cobrança reenviada.',
                        ),
              ),
            ListTile(
              leading: const Icon(Icons.low_priority_rounded),
              title: const Text('Mover para fila de espera'),
              onTap: _busy
                  ? null
                  : () => _run(
                        () => service.moveToWaitlist(
                          registrationId: team.registrationId,
                        ),
                        'Dupla movida para fila.',
                      ),
            ),
            ListTile(
              leading: Icon(Icons.delete_outline_rounded, color: Colors.red.shade400),
              title: Text('Remover dupla', style: TextStyle(color: Colors.red.shade400)),
              onTap: _busy
                  ? null
                  : () async {
                      final confirm = await showDialog<bool>(
                        context: context,
                        builder: (ctx) => AlertDialog(
                          title: const Text('Remover dupla?'),
                          content: const Text('A inscrição será excluída.'),
                          actions: [
                            TextButton(
                              onPressed: () => Navigator.pop(ctx, false),
                              child: const Text('Cancelar'),
                            ),
                            FilledButton(
                              onPressed: () => Navigator.pop(ctx, true),
                              child: const Text('Remover'),
                            ),
                          ],
                        ),
                      );
                      if (confirm == true) {
                        await _run(
                          () => service.removeFromCategory(
                            registrationId: team.registrationId,
                          ),
                          'Dupla removida.',
                        );
                      }
                    },
            ),
          ],
        ),
      ),
    );
  }
}
