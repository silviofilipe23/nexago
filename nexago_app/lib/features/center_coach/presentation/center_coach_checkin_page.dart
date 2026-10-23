import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/router/navigation_helpers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../arena/domain/aulas/arena_class_logic.dart';
import '../../arena/presentation/aulas/widgets/arena_class_atoms.dart';
import '../../athlete_training/presentation/widgets/court_qr_scanner.dart';
import '../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../professor_mode/presentation/widgets/professor_students_widgets.dart';
import '../application/center_coach_providers.dart';
import '../domain/center_coach.dart';
import '../domain/center_coach_repository.dart';
import '../infrastructure/firebase_center_coach_repository.dart';
import 'center_coach_agenda_page.dart' show openCoachSession;

/// Abre a câmera para ler a carteirinha (troca nos testes).
final centerCheckinScanLauncherProvider = Provider<CourtQrScanLauncher>(
  (ref) =>
      (context) => Navigator.of(context).push<String>(
        MaterialPageRoute(
          fullscreenDialog: true,
          builder: (_) => const CourtQrScannerPage(
            title: 'Aponte para a carteirinha do aluno',
            hint: 'O aluno abre Treinos › centro › Carteirinha no app NexaGO.',
          ),
        ),
      ),
);

/// G2/G7/G8 · Check-in no centro: lê a carteirinha (QR) ou busca o aluno
/// pelo nome; o servidor marca presente na aula do horário. Mensalidade em
/// atraso mostra a pendência e a recepção decide.
class CenterCoachCheckinPage extends ConsumerStatefulWidget {
  const CenterCoachCheckinPage({super.key, required this.centerId});

  final String centerId;

  @override
  ConsumerState<CenterCoachCheckinPage> createState() =>
      _CenterCoachCheckinPageState();
}

class _CenterCoachCheckinPageState
    extends ConsumerState<CenterCoachCheckinPage> {
  String _query = '';
  bool _busy = false;
  CenterCheckinResult? _last;

  /// Chegadas desta sessão do app (as mais recentes primeiro).
  final List<CenterCheckinResult> _arrivals = [];

  Future<void> _scan() async {
    final value = await ref.read(centerCheckinScanLauncherProvider)(context);
    if (value == null || !mounted) return;
    await _run(qr: value);
  }

  Future<void> _run({String? qr, String? studentId, bool force = false}) async {
    setState(() => _busy = true);
    try {
      final r = await ref
          .read(centerCoachRepositoryProvider)
          .checkIn(
            centerId: widget.centerId,
            qr: qr,
            studentId: studentId,
            force: force,
          );
      if (!mounted) return;
      setState(() {
        _last = r;
        if (r.ok) {
          _arrivals.removeWhere((a) => a.studentId == r.studentId);
          _arrivals.insert(0, r);
        }
      });
    } on CenterCoachException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.maybeOf(context)
        ?..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final member = ref.watch(centerMembershipProvider(widget.centerId));
    final students =
        ref.watch(coachStudentsProvider(widget.centerId)).valueOrNull ??
        const {};
    final q = _query.trim().toLowerCase();
    final matches = q.length < 2
        ? const <CenterCoachStudent>[]
        : ([
            for (final s in students.values)
              if (s.status == 'active' && s.name.toLowerCase().contains(q)) s,
          ]..sort((a, b) => a.name.compareTo(b.name))).take(8).toList();
    final last = _last;

    return ProfessorLinksScaffold(
      title: 'Check-in',
      subtitle: member?.centerName.toUpperCase(),
      onBack: () => popOrGo(context, AppRoutes.centerCoachAgenda),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
        children: [
          ProfessorLinksPrimaryButton(
            key: const Key('center-checkin-scan'),
            label: 'Ler carteirinha',
            height: 56,
            loading: _busy,
            onPressed: _busy ? null : _scan,
          ),
          const SizedBox(height: 12),
          TextField(
            key: const Key('center-checkin-search'),
            onChanged: (v) => setState(() => _query = v),
            style: AppTypography.bodyS.copyWith(color: colors.onSurface),
            decoration: InputDecoration(
              hintText: 'Ou busque o aluno pelo nome',
              prefixIcon: const Icon(Icons.search_rounded, size: 18),
              filled: true,
              fillColor: ProfessorLinksStyle.soft(colors),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(13),
                borderSide: BorderSide(
                  color: ProfessorLinksStyle.line2(colors),
                ),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(13),
                borderSide: BorderSide(
                  color: ProfessorLinksStyle.line2(colors),
                ),
              ),
            ),
          ),
          for (final s in matches) ...[
            const SizedBox(height: 8),
            ProfessorLinksCard(
              key: Key('center-checkin-student-${s.id}'),
              onTap: _busy ? null : () => _run(studentId: s.id),
              padding: const EdgeInsets.all(12),
              child: Row(
                children: [
                  ArenaClassAvatar(
                    initials: arenaClassInitials(s.name),
                    size: 34,
                  ),
                  const SizedBox(width: 11),
                  Expanded(
                    child: Text(
                      s.name,
                      style: ProfessorLinksStyle.display(
                        13.5,
                        weight: FontWeight.w700,
                        color: colors.onSurface,
                      ),
                    ),
                  ),
                  if (s.billingHold)
                    const ArenaClassTag(
                      label: 'Pendência',
                      color: AppColors.live,
                    ),
                ],
              ),
            ),
          ],
          if (last != null) ...[
            const SizedBox(height: 16),
            _ResultCard(
              key: const Key('center-checkin-result'),
              result: last,
              busy: _busy,
              onForce: () => _run(studentId: last.studentId, force: true),
              onDismiss: () => setState(() => _last = null),
              onOpenSession: last.sessionId == null
                  ? null
                  : () => openCoachSession(
                      context,
                      widget.centerId,
                      last.sessionId!,
                    ),
            ),
          ],
          if (_arrivals.isNotEmpty) ...[
            const SizedBox(height: 16),
            Text(
              'ÚLTIMAS CHEGADAS',
              style: ProfessorLinksStyle.mono(
                10,
                color: ProfessorLinksStyle.dim(colors),
              ).copyWith(letterSpacing: 0.6),
            ),
            const SizedBox(height: 10),
            ProfessorLinksCard(
              padding: EdgeInsets.zero,
              child: Column(
                children: [
                  for (final (i, a) in _arrivals.indexed)
                    Container(
                      padding: const EdgeInsets.fromLTRB(14, 11, 14, 11),
                      decoration: BoxDecoration(
                        border: i == 0
                            ? null
                            : Border(
                                top: BorderSide(
                                  color: ProfessorLinksStyle.line(colors),
                                ),
                              ),
                      ),
                      child: Row(
                        children: [
                          ArenaClassAvatar(
                            initials: arenaClassInitials(a.studentName),
                            size: 32,
                          ),
                          const SizedBox(width: 11),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  a.studentName,
                                  style: ProfessorLinksStyle.display(
                                    13,
                                    weight: FontWeight.w600,
                                    color: colors.onSurface,
                                  ),
                                ),
                                Text(
                                  [
                                    '${a.className} · ${a.startTime}',
                                    if (a.billingHold) 'com pendência',
                                  ].join(' · '),
                                  style: AppTypography.bodyS.copyWith(
                                    fontSize: 11,
                                    color: a.billingHold
                                        ? colors.readableTone(AppColors.pending)
                                        : ProfessorLinksStyle.dim(colors),
                                  ),
                                ),
                              ],
                            ),
                          ),
                          Icon(
                            Icons.check_rounded,
                            size: 17,
                            color: colors.readableTone(AppColors.win),
                          ),
                        ],
                      ),
                    ),
                ],
              ),
            ),
          ],
          const SizedBox(height: 14),
          Text(
            'A recepção vê a situação do pagamento, mas não os valores. O '
            'check-in marca presença só na aula do horário (abre 1h antes).',
            textAlign: TextAlign.center,
            style: AppTypography.bodyS.copyWith(
              fontSize: 11.5,
              height: 1.45,
              color: ProfessorLinksStyle.dim(colors),
            ),
          ),
          if (students.isEmpty &&
              member != null &&
              !member.seesAllStudents) ...[
            const SizedBox(height: 10),
            const ProfessorMutedText(
              'A busca por nome mostra os alunos das suas turmas.',
            ),
          ],
        ],
      ),
    );
  }
}

class _ResultCard extends StatelessWidget {
  const _ResultCard({
    super.key,
    required this.result,
    required this.busy,
    required this.onForce,
    required this.onDismiss,
    this.onOpenSession,
  });

  final CenterCheckinResult result;
  final bool busy;
  final VoidCallback onForce;
  final VoidCallback onDismiss;
  final VoidCallback? onOpenSession;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final r = result;
    final (color, icon, title, text) = switch (r.state) {
      'checked_in' => (
        AppColors.win,
        Icons.check_circle_rounded,
        '${r.studentName} · presente',
        '${r.className} · ${r.startTime}${r.coachName.isEmpty ? '' : ' · ${r.coachName}'}'
            '${r.makeup ? ' · reposição' : ''}',
      ),
      'already' => (
        ProfessorLinksStyle.blue,
        Icons.info_outline_rounded,
        '${r.studentName} já estava presente',
        '${r.className} · ${r.startTime}',
      ),
      'hold' => (
        AppColors.pending,
        Icons.warning_amber_rounded,
        '${r.studentName} · mensalidade em atraso',
        'Aula ${r.className} · ${r.startTime}. Combine a regularização com o '
            'aluno — você decide se registra a presença agora.',
      ),
      'wrong_center' => (
        AppColors.live,
        Icons.block_rounded,
        'Carteirinha de outro centro',
        'Peça para o aluno abrir a carteirinha deste centro no app.',
      ),
      _ => (
        ProfessorLinksStyle.dim(colors),
        Icons.event_busy_outlined,
        '${r.studentName} · sem aula agora',
        'Não há aula dele hoje em que o check-in esteja aberto.',
      ),
    };
    return Container(
      padding: const EdgeInsets.all(15),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: color.withValues(alpha: 0.35)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(icon, size: 22, color: colors.readableTone(color)),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: ProfessorLinksStyle.display(
                        15,
                        weight: FontWeight.w700,
                        color: colors.onSurface,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      text,
                      style: AppTypography.bodyS.copyWith(
                        fontSize: 12.5,
                        height: 1.4,
                        color: ProfessorLinksStyle.mute(colors),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          if (r.state == 'hold') ...[
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  flex: 2,
                  child: ProfessorLinksGhostButton(
                    label: 'Agora não',
                    height: 42,
                    onPressed: busy ? null : onDismiss,
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  flex: 3,
                  child: ProfessorLinksPrimaryButton(
                    key: const Key('center-checkin-force'),
                    label: 'Registrar presença',
                    height: 42,
                    loading: busy,
                    onPressed: busy ? null : onForce,
                  ),
                ),
              ],
            ),
          ] else if (r.ok && onOpenSession != null) ...[
            const SizedBox(height: 10),
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton(
                key: const Key('center-checkin-open-session'),
                onPressed: onOpenSession,
                child: const Text('Ver a chamada da aula'),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
