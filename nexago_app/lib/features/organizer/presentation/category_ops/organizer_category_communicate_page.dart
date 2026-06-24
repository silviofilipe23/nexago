import 'package:flutter/material.dart';
import 'package:nexago_app/core/layout/nexa_app_bar.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/ui/app_snackbar.dart';
import 'package:nexago_app/core/ui/feedback/feedback_page.dart';
import 'package:nexago_app/core/ui/feedback/show_feedback_page.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../domain/tournament_ops/tournament_ops_providers.dart';
import '../tournament_create/widgets/organizer_form_widgets.dart';

class OrganizerCategoryCommunicatePage extends ConsumerStatefulWidget {
  const OrganizerCategoryCommunicatePage({
    super.key,
    required this.tournamentId,
    required this.categoryId,
  });

  final String tournamentId;
  final String categoryId;

  @override
  ConsumerState<OrganizerCategoryCommunicatePage> createState() =>
      _OrganizerCategoryCommunicatePageState();
}

class _OrganizerCategoryCommunicatePageState
    extends ConsumerState<OrganizerCategoryCommunicatePage> {
  final _controller = TextEditingController(
    text: 'Olá! Temos uma atualização sobre o torneio.',
  );
  String _audience = 'all';
  bool _sendPush = true;
  bool _sendWhatsApp = true;
  bool _sending = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    if (_sending) return;
    setState(() => _sending = true);
    try {
      final result = await ref
          .read(organizerCategoryOpsServiceProvider)
          .sendCategoryCommunication(
            tournamentId: widget.tournamentId,
            categoryId: widget.categoryId,
            message: _controller.text,
            audience: _audience,
            sendPush: _sendPush,
          );
      if (_sendWhatsApp) {
        final links = result['whatsappLinks'];
        if (links is List && links.isNotEmpty) {
          final first = links.first;
          if (first is Map) {
            final teamLinks = first['links'];
            if (teamLinks is List && teamLinks.isNotEmpty) {
              final url = teamLinks.first as String;
              final uri = Uri.parse(url);
              if (await canLaunchUrl(uri)) {
                await launchUrl(uri, mode: LaunchMode.externalApplication);
              }
            }
          }
        }
      }
      if (mounted) {
        await pushSuccessFeedback(
          context,
          title: 'Comunicado enviado',
          description:
              'Mensagem enviada (${result['pushCount'] ?? 0} notificações push).',
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
    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      appBar: NexaAppBar(
        title: const Text('Comunicar'),
        backgroundColor: context.themeColors.canvas,
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          const OrganizerSectionLabel('PARA QUEM'),
          DropdownButtonFormField<String>(
            value: _audience,
            items: const [
              DropdownMenuItem(value: 'all', child: Text('Todas as duplas')),
              DropdownMenuItem(value: 'paid', child: Text('Somente pagas')),
              DropdownMenuItem(value: 'pending', child: Text('Somente pendentes')),
            ],
            onChanged: (v) => setState(() => _audience = v ?? 'all'),
          ),
          const SizedBox(height: 16),
          const OrganizerSectionLabel('MENSAGEM'),
          TextField(
            controller: _controller,
            maxLines: 5,
            decoration: const InputDecoration(
              hintText: 'Escreva a mensagem...',
            ),
          ),
          SwitchListTile(
            title: const Text('Notificação no app'),
            value: _sendPush,
            onChanged: (v) => setState(() => _sendPush = v),
          ),
          SwitchListTile(
            title: const Text('Abrir WhatsApp (primeira dupla)'),
            value: _sendWhatsApp,
            onChanged: (v) => setState(() => _sendWhatsApp = v),
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
                Text('Prévia push', style: Theme.of(context).textTheme.labelSmall),
                const SizedBox(height: 6),
                Text(_controller.text),
              ],
            ),
          ),
        ],
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: FilledButton(
            onPressed: _sending ? null : _send,
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
            child: _sending
                ? const CircularProgressIndicator(strokeWidth: 2)
                : const Text('Enviar'),
          ),
        ),
      ),
    );
  }
}
