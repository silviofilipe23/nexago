import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/router/navigation_helpers.dart';
import '../../../../core/router/routes.dart';
import '../../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../application/professor_agenda_providers.dart';
import '../../application/professor_notices_providers.dart';
import '../../domain/professor_notices.dart';
import '../wallet/professor_wallet_widgets.dart';
import 'professor_notice_widgets.dart';

/// F7 — lado do ATLETA: o comunicado do professor (push `professor_notice`).
/// Abrir marca como lido (`respondProfessorNotice` sem resposta); na enquete,
/// tocar numa opção responde (dá para trocar).
class ProfessorNoticeStudentPage extends ConsumerStatefulWidget {
  const ProfessorNoticeStudentPage({super.key, required this.noticeId});

  final String noticeId;

  @override
  ConsumerState<ProfessorNoticeStudentPage> createState() =>
      _ProfessorNoticeStudentPageState();
}

class _ProfessorNoticeStudentPageState
    extends ConsumerState<ProfessorNoticeStudentPage> {
  bool _markedRead = false;
  bool _answering = false;
  String? _localAnswer;

  void _back() => popOrGo(context, AppRoutes.home);

  void _markRead() {
    if (_markedRead) return;
    _markedRead = true;
    // Falha silenciosa: ler não pode travar a tela; a próxima abertura tenta.
    ref
        .read(professorNoticesRepositoryProvider)
        .respond(widget.noticeId)
        .then<void>((_) {}, onError: (_) {});
  }

  Future<void> _answer(String option) async {
    setState(() {
      _answering = true;
      _localAnswer = option;
    });
    final ok = await runProfessorWalletAction(
      context,
      () => ref
          .read(professorNoticesRepositoryProvider)
          .respond(widget.noticeId, answer: option),
      message: 'Resposta enviada.',
    );
    if (!mounted) return;
    setState(() {
      _answering = false;
      if (!ok) _localAnswer = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(professorNoticeForStudentProvider(widget.noticeId));
    final notice = async.valueOrNull;
    final loading = !async.hasValue && !async.hasError;
    if (notice != null && notice.status == ProfessorNoticeStatus.sent) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _markRead();
      });
    }
    final reply =
        ref.watch(professorNoticeMyReplyProvider(widget.noticeId)).valueOrNull;
    final todayKey = ref.watch(professorAgendaNowProvider).todayKey;
    return ProfessorLinksScaffold(
      title: notice?.title ?? 'Comunicado',
      subtitle: notice == null
          ? null
          : 'DO PROF. ${notice.professorName}'.toUpperCase(),
      onBack: _back,
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
        children: [
          if (loading)
            const ProfessorWalletLoading()
          else if (notice == null || notice.status != ProfessorNoticeStatus.sent)
            // Sem doc ou sem permissão (não é para esta conta): mesmo aviso.
            const ProfessorLinksNote(
              'Este comunicado não está disponível para esta conta.',
              key: Key('professor-notice-student-missing'),
            )
          else
            ProfessorNoticeContent(
              professorName: notice.professorName,
              kind: notice.kind,
              title: notice.title,
              body: notice.body,
              pollOptions: notice.pollOptions,
              whenLabel: professorNoticeWhenLabel(notice.sentAt, todayKey),
              selected: _localAnswer ?? reply?.answer,
              busy: _answering,
              onAnswer: _answer,
            ),
        ],
      ),
    );
  }
}
