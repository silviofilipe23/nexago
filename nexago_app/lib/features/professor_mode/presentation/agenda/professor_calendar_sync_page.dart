import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../core/router/navigation_helpers.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/ui/app_snackbar.dart';
import '../../../professor_links/application/professor_links_providers.dart';
import '../../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../application/professor_agenda_providers.dart';
import '../../application/professor_students_providers.dart';
import '../../application/professor_wallet_providers.dart';
import '../../domain/professor_agenda.dart';
import '../../infrastructure/professor_students_repository.dart';
import '../widgets/professor_students_widgets.dart';
import '../wallet/professor_wallet_widgets.dart';

/// Abre a URL do app de calendário. Injetável para teste.
typedef ProfessorCalendarOpener = Future<bool> Function(Uri uri);

final professorCalendarOpenerProvider = Provider<ProfessorCalendarOpener>(
  (ref) => (uri) => launchUrl(uri, mode: LaunchMode.externalApplication)
      .catchError((_) => false),
);

/// E8 Sincronizar calendário: um feed `.ics` assinável (Google Agenda,
/// Apple Calendário, Outlook) com as aulas e os bloqueios. Abrir a tela liga
/// o feed (`configureProfessorCalendarFeed`). Sem login no Google: o
/// calendário assina a URL e atualiza sozinho.
class ProfessorCalendarSyncPage extends ConsumerStatefulWidget {
  const ProfessorCalendarSyncPage({super.key});

  @override
  ConsumerState<ProfessorCalendarSyncPage> createState() =>
      _ProfessorCalendarSyncPageState();
}

class _ProfessorCalendarSyncPageState
    extends ConsumerState<ProfessorCalendarSyncPage> {
  ProfessorCalendarFeed? _feed;
  String? _error;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _configure());
  }

  void _back() => popOrGo(context, AppRoutes.professorAgenda);

  Future<void> _configure({
    bool rotate = false,
    bool? showStudentNames,
    List<String>? excludedArenaIds,
    String? message,
  }) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final feed =
          await ref.read(professorAgendaRepositoryProvider).configureFeed(
                rotate: rotate,
                showStudentNames: showStudentNames,
                excludedArenaIds: excludedArenaIds,
              );
      if (!mounted) return;
      setState(() => _feed = feed);
      if (message != null) showAppSnackBar(context, message);
    } catch (e) {
      if (!mounted) return;
      final text = e is ProfessorStudentsException
          ? e.message
          : 'Não foi possível ligar a sincronização.';
      if (_feed == null) {
        setState(() => _error = text);
      } else {
        showAppSnackBar(context, text, isError: true);
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _open(Uri uri) async {
    final ok = await ref.read(professorCalendarOpenerProvider)(uri);
    if (!ok && mounted) {
      showAppSnackBar(
        context,
        'Não deu para abrir o calendário. Copie o link e assine por URL.',
        isError: true,
      );
    }
  }

  Future<void> _rotate() async {
    final ok = await confirmProfessorWalletAction(
      context,
      title: 'Gerar novo link?',
      body: 'O link atual para de funcionar: os calendários que já assinam '
          'sua agenda deixam de atualizar e você precisa assinar o novo link '
          'em cada um.',
      confirmLabel: 'Gerar novo link',
    );
    if (!ok || !mounted) return;
    await _configure(rotate: true, message: 'Novo link gerado.');
  }

  /// Arenas do professor (vínculos e turmas), por nome.
  Map<String, String> _arenas() {
    final out = <String, String>{};
    for (final l
        in ref.watch(myProfessorLinksProvider).valueOrNull ?? const []) {
      out[l.arenaId] = l.arenaName;
    }
    for (final a in ref.watch(professorStudentsProvider).valueOrNull?.arenas ??
        const []) {
      out[a.arenaId] = a.arenaName;
    }
    for (final l
        in ref.watch(professorLessonsProvider).valueOrNull ?? const []) {
      out.putIfAbsent(l.arenaId, () => l.arenaName);
    }
    return out;
  }

  @override
  Widget build(BuildContext context) {
    final feed = _feed;
    return ProfessorLinksScaffold(
      title: 'Sincronizar calendário',
      subtitle: 'SUA AGENDA NEXAGO EM OUTROS APPS',
      onBack: _back,
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
        children: [
          if (feed == null && _error != null)
            ProfessorRetryCard(message: _error!, onRetry: _configure)
          else if (feed == null)
            const ProfessorWalletLoading()
          else
            ..._content(feed),
        ],
      ),
    );
  }

  List<Widget> _content(ProfessorCalendarFeed feed) {
    final colors = context.themeColors;
    final arenas = _arenas();
    final excluded = feed.excludedArenaIds.toSet();
    return [
      const ProfessorLinksNote(
        'Seu calendário assina este link e atualiza sozinho (o Google pode '
        'levar algumas horas). Entram suas aulas de turma, as da carteira e '
        'os bloqueios — só leitura: mudar lá não muda o nexaGO.',
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
                feed.url,
                key: const Key('professor-sync-url'),
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
              key: const Key('professor-sync-copy'),
              onPressed: () async {
                await Clipboard.setData(ClipboardData(text: feed.url));
                if (mounted) showAppSnackBar(context, 'Link copiado.');
              },
              child: const Text('Copiar'),
            ),
          ],
        ),
      ),
      const SizedBox(height: 12),
      for (final (key, label, sub, url) in [
        (
          'google',
          'Google Agenda',
          'Abre "Adicionar agenda por URL"',
          professorGoogleCalendarUrl(feed.url),
        ),
        (
          'apple',
          'Apple Calendário',
          'Assinatura no iPhone, iPad ou Mac',
          professorWebcalUrl(feed.url),
        ),
        (
          'outlook',
          'Outlook',
          'Assinar da Web',
          professorOutlookCalendarUrl(feed.url),
        ),
      ]) ...[
        ProfessorLinksCard(
          key: Key('professor-sync-open-$key'),
          onTap: () => _open(Uri.parse(url)),
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
                    ProfessorMutedText(sub),
                  ],
                ),
              ),
              Text(
                'Assinar',
                style: ProfessorLinksStyle.display(
                  12.5,
                  weight: FontWeight.w600,
                  color: AppColors.brand,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 8),
      ],
      const SizedBox(height: 14),
      const ProfessorLinksKicker('O que enviar'),
      const SizedBox(height: 8),
      ProfessorRowsBlock(
        children: [
          for (final e in arenas.entries)
            ProfessorWalletToggleRow(
              key: Key('professor-sync-arena-${e.key}'),
              title: 'Aulas da ${e.value}',
              value: !excluded.contains(e.key),
              onChanged: _busy
                  ? null
                  : (on) => _configure(
                        excludedArenaIds: on
                            ? [
                                for (final id in excluded)
                                  if (id != e.key) id,
                              ]
                            : [...excluded, e.key],
                      ),
            ),
          ProfessorWalletToggleRow(
            key: const Key('professor-sync-names'),
            title: 'Mostrar nome do aluno',
            subtitle: 'Desligado: aparece só "Aula particular"',
            value: feed.showStudentNames,
            onChanged: _busy ? null : (v) => _configure(showStudentNames: v),
          ),
        ],
      ),
      const SizedBox(height: 18),
      ProfessorLinksGhostButton(
        key: const Key('professor-sync-rotate'),
        label: 'Gerar novo link',
        color: AppColors.live,
        loading: _busy,
        onPressed: _rotate,
      ),
      const SizedBox(height: 8),
      const ProfessorActionHintCentered(
        'Use se o link vazou: os calendários atuais param de atualizar.',
      ),
    ];
  }
}

class ProfessorActionHintCentered extends StatelessWidget {
  const ProfessorActionHintCentered(this.text, {super.key});

  final String text;

  @override
  Widget build(BuildContext context) => Text(
        text,
        textAlign: TextAlign.center,
        style: ProfessorLinksStyle.mono(
          10,
          weight: FontWeight.w500,
          color: ProfessorLinksStyle.dim(context.themeColors),
        ),
      );
}
