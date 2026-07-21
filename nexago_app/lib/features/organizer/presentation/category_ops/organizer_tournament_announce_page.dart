import 'package:flutter/material.dart';
import 'package:nexago_app/core/layout/nexa_app_bar.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/ui/app_snackbar.dart';
import 'package:nexago_app/core/ui/feedback/feedback_page.dart';
import 'package:nexago_app/core/ui/feedback/show_feedback_page.dart';

import '../../domain/tournament_ops/tournament_ops_providers.dart';
import '../tournament_create/widgets/organizer_form_widgets.dart';

const _kAnnouncementMaxLength = 500;

/// Publica um aviso PÚBLICO e PERSISTENTE do torneio inteiro (todas as
/// categorias, visível a qualquer torcedor) no feed da Comunidade — item
/// `organizer_announcement` em `communityFeed`.
///
/// Diferente de `OrganizerCategoryCommunicatePage` (rota `communicate`), que
/// é mensagem direta (push + WhatsApp) só pros times de UMA categoria e some
/// do feed depois de enviada, essa é uma tela nova e tournament-wide (sem
/// `categoryId`): não cabia como aba dentro da tela de categoria porque o
/// alcance e o destino (feed público vs. inbox privado) são conceitos de
/// produto diferentes. Reaproveita o mesmo client de callable
/// (`OrganizerCategoryOpsService`) e o mesmo padrão visual da tela de
/// comunicado por categoria.
class OrganizerTournamentAnnouncePage extends ConsumerStatefulWidget {
  const OrganizerTournamentAnnouncePage({
    super.key,
    required this.tournamentId,
  });

  final String tournamentId;

  @override
  ConsumerState<OrganizerTournamentAnnouncePage> createState() =>
      _OrganizerTournamentAnnouncePageState();
}

class _OrganizerTournamentAnnouncePageState
    extends ConsumerState<OrganizerTournamentAnnouncePage> {
  final _controller = TextEditingController();
  bool _sending = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _publish() async {
    if (_sending) return;
    final message = _controller.text.trim();
    if (message.isEmpty) return;
    setState(() => _sending = true);
    try {
      final result = await ref
          .read(organizerCategoryOpsServiceProvider)
          .postTournamentAnnouncement(
            tournamentId: widget.tournamentId,
            message: message,
          );
      if (mounted) {
        await pushSuccessFeedback(
          context,
          title: 'Aviso publicado',
          description:
              'Visível pra todo mundo no feed da Comunidade (${result['pushCount'] ?? 0} notificações push).',
          primaryAction: FeedbackAction(
            label: 'Continuar',
            onPressed: () => Navigator.of(context).pop(),
          ),
        );
      }
    } catch (e) {
      if (mounted) showAppSnackBar(context, '$e', isError: true);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final length = _controller.text.trim().length;
    final overLimit = length > _kAnnouncementMaxLength;
    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      appBar: NexaAppBar(
        title: const Text('Publicar aviso'),
        backgroundColor: context.themeColors.canvas,
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          const OrganizerSectionLabel('AVISO PÚBLICO DO TORNEIO'),
          Text(
            'Fica salvo e visível pra qualquer torcedor no feed da '
            'Comunidade — não só pros inscritos. Use pra avisos gerais do '
            'evento (ex. mudança de horário, clima, local).',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: context.themeColors.onSurfaceMuted,
                  height: 1.4,
                ),
          ),
          const SizedBox(height: 16),
          const OrganizerSectionLabel('MENSAGEM'),
          TextField(
            controller: _controller,
            maxLines: 5,
            maxLength: _kAnnouncementMaxLength,
            onChanged: (_) => setState(() {}),
            decoration: const InputDecoration(
              hintText: 'Ex.: Por causa da chuva, os jogos de amanhã cedo '
                  'foram remarcados para as 14h.',
            ),
          ),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: context.themeColors.surfaceCard,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Prévia no feed', style: Theme.of(context).textTheme.labelSmall),
                const SizedBox(height: 6),
                Text(
                  _controller.text.trim().isEmpty
                      ? 'Sua mensagem aparece aqui.'
                      : _controller.text.trim(),
                ),
              ],
            ),
          ),
        ],
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: FilledButton(
            onPressed: _sending || _controller.text.trim().isEmpty || overLimit
                ? null
                : _publish,
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
            child: _sending
                ? const CircularProgressIndicator(strokeWidth: 2)
                : const Text('Publicar'),
          ),
        ),
      ),
    );
  }
}
