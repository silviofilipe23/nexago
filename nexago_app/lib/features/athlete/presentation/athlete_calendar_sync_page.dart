import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/links/open_external_url.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../professor_mode/domain/professor_agenda.dart'
    show
        professorGoogleCalendarUrl,
        professorOutlookCalendarUrl,
        professorWebcalUrl;
import '../data/athlete_calendar_feed_repository.dart';

/// Abre a URL do app de calendário. Injetável para teste.
typedef AthleteCalendarOpener = Future<bool> Function(Uri uri);

final athleteCalendarOpenerProvider = Provider<AthleteCalendarOpener>(
  (ref) => (uri) => openExternalUrl(uri.toString()),
);

/// Nome do calendário nos apps que assinam o feed.
const kAthleteCalendarName = 'Agenda nexaGO';

/// Assinar a Agenda no calendário do celular (Fase 3 da análise da Agenda):
/// um feed `.ics` que o Google Agenda, o Apple Calendário e o Outlook assinam
/// por URL e atualizam sozinhos. Abrir a tela liga o feed
/// (`configureAthleteCalendarFeed`). Mesmo desenho do feed do professor.
class AthleteCalendarSyncPage extends ConsumerStatefulWidget {
  const AthleteCalendarSyncPage({super.key});

  @override
  ConsumerState<AthleteCalendarSyncPage> createState() =>
      _AthleteCalendarSyncPageState();
}

class _AthleteCalendarSyncPageState
    extends ConsumerState<AthleteCalendarSyncPage> {
  String? _url;
  String? _error;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _configure());
  }

  Future<void> _configure({bool rotate = false, String? message}) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final url = await ref
          .read(athleteCalendarFeedRepositoryProvider)
          .configure(rotate: rotate);
      if (!mounted) return;
      setState(() => _url = url);
      if (message != null) showAppSnackBar(context, message);
    } on AthleteCalendarFeedException catch (e) {
      if (!mounted) return;
      if (_url == null) {
        setState(() => _error = e.message);
      } else {
        showAppSnackBar(context, e.message, isError: true);
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _open(String url) async {
    final ok = await ref.read(athleteCalendarOpenerProvider)(Uri.parse(url));
    if (!ok && mounted) {
      showAppSnackBar(
        context,
        'Não deu para abrir o calendário. Copie o link e assine por URL.',
        isError: true,
      );
    }
  }

  Future<void> _copy(String url) async {
    await Clipboard.setData(ClipboardData(text: url));
    if (mounted) showAppSnackBar(context, 'Link copiado.');
  }

  Future<void> _rotate() async {
    final colors = context.themeColors;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Gerar novo link?'),
        content: const Text(
          'O link atual para de funcionar: os calendários que já assinam sua '
          'agenda deixam de atualizar e você precisa assinar o novo link em '
          'cada um.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Manter o link'),
          ),
          TextButton(
            key: const Key('athlete-calendar-rotate-confirm'),
            style: TextButton.styleFrom(foregroundColor: colors.live),
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Gerar novo link'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    await _configure(rotate: true, message: 'Novo link gerado.');
  }

  @override
  Widget build(BuildContext context) {
    final url = _url;
    return Scaffold(
      appBar: AppBar(title: const Text('Assinar no calendário')),
      body: SafeArea(
        top: false,
        child: switch ((url, _error)) {
          (null, final String error) => _Retry(
              message: error,
              onRetry: _busy ? null : () => _configure(),
            ),
          (null, _) => const Center(child: CircularProgressIndicator()),
          (final String url, _) => _content(url),
        },
      ),
    );
  }

  Widget _content(String url) {
    final colors = context.themeColors;
    final options = [
      (
        'google',
        'Google Agenda',
        'Abre "Adicionar agenda por URL"',
        professorGoogleCalendarUrl(url),
      ),
      (
        'apple',
        'Apple Calendário',
        'Assinatura no iPhone, iPad ou Mac',
        professorWebcalUrl(url),
      ),
      (
        'outlook',
        'Outlook',
        'Assinar da Web',
        professorOutlookCalendarUrl(url, name: kAthleteCalendarName),
      ),
    ];
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
      children: [
        const ProfessorLinksNote(
          'Seu calendário assina este link e atualiza sozinho (o Google pode '
          'levar algumas horas). Entram suas reservas, aulas e torneios. É só '
          'leitura: mudar lá não muda o nexaGO.',
          tone: ProfessorLinksNoteTone.blue,
        ),
        const SizedBox(height: 16),
        const ProfessorLinksKicker('Seu link'),
        const SizedBox(height: 8),
        ProfessorLinksCard(
          child: Row(
            children: [
              Expanded(
                child: Text(
                  url,
                  key: const Key('athlete-calendar-url'),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: ProfessorLinksStyle.mono(
                    10.5,
                    weight: FontWeight.w500,
                    color: ProfessorLinksStyle.mute(colors),
                  ),
                ),
              ),
              TextButton(
                key: const Key('athlete-calendar-copy'),
                onPressed: () => _copy(url),
                child: const Text('Copiar'),
              ),
            ],
          ),
        ),
        const SizedBox(height: 6),
        Text(
          'Quem tiver este link vê sua agenda. Não compartilhe.',
          style: ProfessorLinksStyle.mono(
            10,
            weight: FontWeight.w500,
            color: ProfessorLinksStyle.dim(colors),
          ),
        ),
        const SizedBox(height: 14),
        for (final (key, label, sub, target) in options) ...[
          _CalendarOption(
            key: Key('athlete-calendar-open-$key'),
            label: label,
            subtitle: sub,
            onTap: () => _open(target),
          ),
          const SizedBox(height: 8),
        ],
        const SizedBox(height: 18),
        ProfessorLinksGhostButton(
          key: const Key('athlete-calendar-rotate'),
          label: 'Gerar novo link',
          color: AppColors.live,
          loading: _busy,
          onPressed: _rotate,
        ),
        const SizedBox(height: 8),
        Text(
          'Use se o link vazou: os calendários atuais param de atualizar.',
          textAlign: TextAlign.center,
          style: ProfessorLinksStyle.mono(
            10,
            weight: FontWeight.w500,
            color: ProfessorLinksStyle.dim(colors),
          ),
        ),
      ],
    );
  }
}

class _CalendarOption extends StatelessWidget {
  const _CalendarOption({
    super.key,
    required this.label,
    required this.subtitle,
    required this.onTap,
  });

  final String label;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return ProfessorLinksCard(
      onTap: onTap,
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: ProfessorLinksStyle.soft(colors),
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Icon(
              Icons.calendar_month_outlined,
              color: AppColors.brand,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: ProfessorLinksStyle.display(
                    14,
                    weight: FontWeight.w700,
                    color: colors.onSurface,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  style: ProfessorLinksStyle.mono(
                    10.5,
                    weight: FontWeight.w500,
                    color: ProfessorLinksStyle.mute(colors),
                  ),
                ),
              ],
            ),
          ),
          Text(
            'Assinar',
            style: ProfessorLinksStyle.display(
              12.5,
              weight: FontWeight.w600,
              color: colors.readableTone(AppColors.brand),
            ),
          ),
        ],
      ),
    );
  }
}

class _Retry extends StatelessWidget {
  const _Retry({required this.message, required this.onRetry});

  final String message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(message, textAlign: TextAlign.center),
            const SizedBox(height: 12),
            FilledButton(
                onPressed: onRetry, child: const Text('Tentar de novo')),
          ],
        ),
      ),
    );
  }
}
