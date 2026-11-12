import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/errors/friendly_error_message.dart';
import '../../../core/layout/nexa_app_bar.dart';
import '../../../core/router/navigation_helpers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/time/nexago_event_timezone.dart';
import '../../../core/ui/app_snackbar.dart' show showAppSnackBar;
import '../../../core/ui/nexa_async_view.dart';
import '../../../core/ui/nexa_bottom_action_bar.dart';
import '../../athlete_training/application/athlete_training_providers.dart'
    show contractSignAppVersionProvider, contractSignPlatformProvider;
import '../../athlete_training/presentation/widgets/center_contract_widgets.dart'
    show ContractEssentialsCard, ContractPaper;
import '../../schedule_plans/presentation/widgets/schedule_plan_ui.dart';
import '../application/class_agreements_providers.dart';
import '../domain/class_agreements.dart';
import '../infrastructure/class_agreements_repository.dart';

/// Contratos de aulas (canvas 07/08 do atleta e 01–03 do professor): a lista,
/// a leitura com comprovante e, no contrato de professor pendente, a
/// assinatura.

void openClassAgreement(BuildContext context, String agreementId) =>
    context.pushNamed(
      AppRouteNames.classAgreement,
      pathParameters: {'agreementId': agreementId},
    );

String _wall(DateTime? at) {
  if (at == null) return '';
  final l = toNexagoEventLocal(at);
  String two(int n) => n.toString().padLeft(2, '0');
  return '${two(l.day)}/${two(l.month)}/${l.year} ${two(l.hour)}:${two(l.minute)}';
}

/// Rótulo + tom do selo do contrato.
(String, Color) agreementBadge(ClassAgreement a) => switch (a.status) {
      ClassAgreementStatus.pending => ('Assinar', AppColors.brand),
      ClassAgreementStatus.signed => ('Assinado', AppColors.win),
      ClassAgreementStatus.canceled => ('Cancelado', AppColors.onSurfaceMuted),
      ClassAgreementStatus.ended => ('Encerrado', AppColors.onSurfaceMuted),
    };

// ── 07 · lista ────────────────────────────────────────────────────────────

class ClassAgreementsPage extends ConsumerStatefulWidget {
  const ClassAgreementsPage({super.key});

  @override
  ConsumerState<ClassAgreementsPage> createState() => _ClassAgreementsPageState();
}

class _ClassAgreementsPageState extends ConsumerState<ClassAgreementsPage> {
  bool _current = true;

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(myClassAgreementsProvider);
    return Scaffold(
      appBar: NexaAppBar(
        leading: IconButton(
          tooltip: 'Voltar',
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () => popOrGo(context, AppRoutes.discover),
        ),
        title: const Text('Contratos'),
      ),
      body: NexaAsyncView<List<ClassAgreement>>(
        value: async,
        errorTitle: 'Contratos',
        errorMessage: 'Não foi possível abrir os seus contratos.',
        onRetry: () => ref.invalidate(myClassAgreementsProvider),
        data: (all) {
          final current = all.where((a) => a.isCurrent).toList();
          final past = all.where((a) => !a.isCurrent).toList();
          final shown = _current ? current : past;
          final pending = shown.where((a) => a.isPending).toList();
          final groups = groupAgreementsByArena(shown.where((a) => !a.isPending));
          return RefreshIndicator(
            color: AppColors.brand,
            onRefresh: () => ref.refresh(myClassAgreementsProvider.future),
            child: ListView(
              key: const Key('class-agreements-list'),
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
              children: [
                Row(
                  children: [
                    Expanded(
                      child: ScheduleChoiceChip(
                        key: const Key('class-agreements-current'),
                        label: 'Vigentes · ${current.length}',
                        selected: _current,
                        onTap: () => setState(() => _current = true),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: ScheduleChoiceChip(
                        key: const Key('class-agreements-past'),
                        label: 'Encerrados · ${past.length}',
                        selected: !_current,
                        onTap: () => setState(() => _current = false),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 18),
                if (shown.isEmpty)
                  _EmptyAgreements(current: _current),
                if (pending.isNotEmpty) ...[
                  const ScheduleKicker('Esperando sua assinatura'),
                  const SizedBox(height: 10),
                  for (final a in pending) ...[
                    _AgreementCard(agreement: a),
                    const SizedBox(height: 10),
                  ],
                  const SizedBox(height: 8),
                ],
                for (final g in groups) ...[
                  ScheduleKicker(
                    g.items.length > 1 ? '${g.arenaName} · ${g.items.length} contratos' : g.arenaName,
                  ),
                  const SizedBox(height: 10),
                  for (final a in g.items) ...[
                    _AgreementCard(agreement: a),
                    const SizedBox(height: 10),
                  ],
                  const SizedBox(height: 8),
                ],
              ],
            ),
          );
        },
      ),
    );
  }
}

class _EmptyAgreements extends StatelessWidget {
  const _EmptyAgreements({required this.current});

  final bool current;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 40),
      child: Column(
        children: [
          Icon(Icons.description_outlined, size: 40, color: colors.onSurfaceMuted),
          const SizedBox(height: 12),
          Text(
            current ? 'Nenhum contrato vigente' : 'Nenhum contrato encerrado',
            style: AppTypography.soraRegular(fontSize: 15.5, fontWeight: FontWeight.w700, color: colors.onSurface),
          ),
          const SizedBox(height: 6),
          Text(
            current
                ? 'Contrate um plano de aulas na página de uma arena: o '
                    'contrato que você assinar aparece aqui.'
                : 'Contratos de matrículas canceladas ficam aqui.',
            textAlign: TextAlign.center,
            style: AppTypography.bodyS.copyWith(color: colors.onSurfaceMuted, height: 1.45),
          ),
        ],
      ),
    );
  }
}

class _AgreementCard extends StatelessWidget {
  const _AgreementCard({required this.agreement});

  final ClassAgreement agreement;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final a = agreement;
    final (label, tone) = agreementBadge(a);
    final sub = a.isProfessor
        ? (a.isPending ? 'Enviado por ${a.arenaName}' : a.arenaName)
        : a.essentials
            .where((r) => r.label == 'Professor' || r.label == 'Aulas')
            .map((r) => r.value)
            .join(' · ');
    final when = a.isPending
        ? (a.sentAt == null ? '' : 'Enviado ${_wall(a.sentAt).split(' ').first}')
        : a.signedAt == null
            ? ''
            : 'Assinado ${_wall(a.signedAt).split(' ').first}';
    return ScheduleCard(
      key: Key('class-agreement-${a.agreementId}'),
      selected: a.isPending,
      onTap: () => openClassAgreement(context, a.agreementId),
      child: Row(
        children: [
          Container(
            width: 46,
            height: 46,
            decoration: BoxDecoration(
              color: AppColors.brand.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Icon(
              a.isProfessor ? Icons.school_outlined : Icons.description_outlined,
              color: colors.brandText,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  a.headline,
                  style: AppTypography.soraRegular(fontSize: 15, fontWeight: FontWeight.w700, color: colors.onSurface),
                ),
                if (sub.isNotEmpty) ...[
                  const SizedBox(height: 3),
                  Text(
                    sub,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.bodyS.copyWith(color: colors.onSurfaceMuted),
                  ),
                ],
                const SizedBox(height: 8),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    _Pill(label: label, tone: tone),
                    if (when.isNotEmpty) _Pill(label: when),
                    if (a.status == ClassAgreementStatus.signed && a.endDate != null)
                      _Pill(label: 'até ${brDateKey(a.endDate)}'),
                  ],
                ),
              ],
            ),
          ),
          Icon(Icons.chevron_right_rounded, color: colors.onSurfaceMuted),
        ],
      ),
    );
  }
}

class _Pill extends StatelessWidget {
  const _Pill({required this.label, this.tone});

  final String label;
  final Color? tone;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final t = tone;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: t == null ? colors.surfaceRaised : t.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: t == null ? colors.onSurface.withValues(alpha: 0.08) : t.withValues(alpha: 0.4)),
      ),
      child: Text(
        label,
        style: AppTypography.mono(
          fontSize: 10,
          fontWeight: FontWeight.w600,
          color: t == null ? colors.onSurfaceMuted : colors.readableTone(t),
        ),
      ),
    );
  }
}

// ── 08 · contrato (leitura, comprovante, assinatura do professor) ─────────

class ClassAgreementPage extends ConsumerStatefulWidget {
  const ClassAgreementPage({super.key, required this.agreementId});

  final String agreementId;

  @override
  ConsumerState<ClassAgreementPage> createState() => _ClassAgreementPageState();
}

class _ClassAgreementPageState extends ConsumerState<ClassAgreementPage> {
  final _scroll = ScrollController();
  final _reading = Stopwatch();
  bool _reachedEnd = false;
  double _progress = 0;
  bool _signing = false;
  bool _justSigned = false;

  /// O cronômetro de leitura começa quando o texto chega, não ao abrir a tela.
  bool _loadedOnce = false;

  static const _endSlack = 24.0;

  @override
  void initState() {
    super.initState();
    _scroll.addListener(_measure);
  }

  @override
  void dispose() {
    _scroll
      ..removeListener(_measure)
      ..dispose();
    super.dispose();
  }

  void _measure() {
    if (!_scroll.hasClients) return;
    final p = _scroll.position;
    final max = p.maxScrollExtent;
    final progress = max <= 0 ? 1.0 : (p.pixels / max).clamp(0.0, 1.0);
    final reached = _reachedEnd || max <= 0 || p.pixels >= max - _endSlack;
    if (progress != _progress || reached != _reachedEnd) {
      setState(() {
        _progress = progress;
        _reachedEnd = reached;
      });
    }
  }

  Future<void> _sign(ClassAgreement a) async {
    final agreed = await showScheduleSheet<bool>(
      context,
      builder: (_) => _ProfessorSignSheet(arenaName: a.arenaName),
    );
    if (agreed != true || !mounted) return;
    setState(() => _signing = true);
    try {
      final appVersion =
          await ref.read(contractSignAppVersionProvider.future).catchError((_) => '');
      await ref.read(classAgreementsRepositoryProvider).sign(
            agreementId: a.agreementId,
            sha256: a.sha256,
            readSeconds: _reading.elapsed.inSeconds,
            platform: ref.read(contractSignPlatformProvider),
            appVersion: appVersion,
          );
      if (!mounted) return;
      ref
        ..invalidate(classAgreementProvider(widget.agreementId))
        ..invalidate(myClassAgreementsProvider);
      setState(() {
        _signing = false;
        _justSigned = true;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _signing = false);
      showAppSnackBar(context, friendlyErrorMessage(e, action: 'Não foi possível assinar o contrato'), isError: true);
      // Texto mudou ou o contrato não espera mais assinatura: relê e trava a leitura de novo.
      if (e is ClassAgreementException && e.code == 'failed-precondition') {
        setState(() {
          _reachedEnd = false;
          _progress = 0;
          _loadedOnce = false;
        });
        ref.invalidate(classAgreementProvider(widget.agreementId));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(classAgreementProvider(widget.agreementId));
    final a = async.valueOrNull;
    return Scaffold(
      appBar: NexaAppBar(
        leading: IconButton(
          tooltip: 'Voltar',
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () => popOrGo(context, AppRoutes.classAgreements),
        ),
        title: Text(a?.headline ?? 'Contrato'),
      ),
      body: NexaAsyncView<ClassAgreement>(
        value: async,
        skipLoadingOnReload: true,
        errorTitle: 'Contrato',
        errorMessage: 'Não foi possível abrir este contrato.',
        onRetry: () => ref.invalidate(classAgreementProvider(widget.agreementId)),
        data: (a) {
          if (_justSigned && a.status == ClassAgreementStatus.signed) {
            return _SignedNow(agreement: a);
          }
          if (!_loadedOnce) {
            _loadedOnce = true;
            _reading
              ..reset()
              ..start();
          }
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted) _measure();
          });
          return _reader(a);
        },
      ),
      bottomNavigationBar: a == null || !a.isPending || _justSigned
          ? null
          : NexaBottomActionBar(
              hint: _reachedEnd ? null : 'Leia até o fim para assinar',
              action: SchedulePrimaryButton(
                key: const Key('class-agreement-sign'),
                label: 'Assinar contrato',
                icon: _reachedEnd ? Icons.draw_rounded : Icons.lock_outline_rounded,
                loading: _signing,
                onPressed: _reachedEnd ? () => _sign(a) : null,
              ),
            ),
    );
  }

  Widget _reader(ClassAgreement a) {
    final colors = context.themeColors;
    final (label, tone) = agreementBadge(a);
    return Column(
      children: [
        if (a.isPending)
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 4, 20, 4),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(2),
              child: LinearProgressIndicator(
                value: _progress,
                minHeight: 3,
                color: AppColors.brand,
                backgroundColor: colors.surfaceRaised,
              ),
            ),
          ),
        Expanded(
          child: NotificationListener<ScrollMetricsNotification>(
            onNotification: (_) {
              WidgetsBinding.instance.addPostFrameCallback((_) {
                if (mounted) _measure();
              });
              return false;
            },
            child: ListView(
              key: const Key('class-agreement-scroll'),
              controller: _scroll,
              padding: const EdgeInsets.fromLTRB(20, 10, 20, 32),
              children: [
                Row(
                  children: [
                    _Pill(label: label, tone: tone),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        a.status == ClassAgreementStatus.signed && a.endDate != null
                            ? 'Vigente até ${brDateKey(a.endDate)}'
                            : a.arenaName,
                        style: AppTypography.bodyS.copyWith(color: colors.onSurfaceMuted),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                if (a.essentials.isNotEmpty) ContractEssentialsCard(rows: a.essentials),
                const SizedBox(height: 16),
                const ScheduleKicker('Texto completo'),
                const SizedBox(height: 8),
                ContractPaper(
                  title: a.title,
                  meta: [
                    if (a.number.isNotEmpty) a.number,
                    if (a.templateVersion > 0) 'v${a.templateVersion}' else 'modelo nexaGO',
                  ].join(' · '),
                  body: a.body,
                  signatures: a.signedAt == null
                      ? const []
                      : [(a.partyName, '${a.isProfessor ? 'Professor' : 'Aluno'} · ${_wall(a.signedAt)}')],
                ),
                if (a.evidence != null) ...[
                  const SizedBox(height: 14),
                  _ReceiptCard(agreement: a),
                ],
                if (a.isPending) ...[
                  const SizedBox(height: 10),
                  Text(
                    'Fim do contrato',
                    textAlign: TextAlign.center,
                    style: AppTypography.mono(fontSize: 9.5, color: colors.onSurfaceMuted),
                  ),
                ],
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _ReceiptCard extends StatelessWidget {
  const _ReceiptCard({required this.agreement});

  final ClassAgreement agreement;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final a = agreement;
    final ev = a.evidence!;
    final device = [
      if (ev.platform.isNotEmpty) ev.platform == 'ios' ? 'iPhone' : ev.platform == 'android' ? 'Android' : ev.platform,
      if (ev.appVersion.isNotEmpty) 'app ${ev.appVersion}',
    ].join(' · ');
    Widget row(String k, String v) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 6),
          child: Row(
            children: [
              Expanded(child: Text(k, style: AppTypography.bodyS.copyWith(color: colors.onSurfaceMuted))),
              Text(v, style: AppTypography.mono(fontSize: 12, fontWeight: FontWeight.w600, color: colors.onSurface)),
            ],
          ),
        );
    return ScheduleCard(
      key: const Key('class-agreement-receipt'),
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const ScheduleKicker('Comprovante da assinatura'),
          const SizedBox(height: 4),
          row('Quem assinou', a.partyName),
          row('Quando', _wall(a.signedAt)),
          if (device.isNotEmpty) row('Aparelho', device),
          if (ev.ip.isNotEmpty) row('IP', ev.ip),
          row('Impressão do texto', agreementShortHash(a.sha256)),
        ],
      ),
    );
  }
}

class _SignedNow extends StatelessWidget {
  const _SignedNow({required this.agreement});

  final ClassAgreement agreement;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final a = agreement;
    return ListView(
      key: const Key('class-agreement-signed-now'),
      padding: const EdgeInsets.fromLTRB(20, 32, 20, 32),
      children: [
        Center(
          child: Container(
            width: 76,
            height: 76,
            decoration: BoxDecoration(
              color: AppColors.win,
              shape: BoxShape.circle,
              boxShadow: [BoxShadow(color: AppColors.win.withValues(alpha: 0.15), spreadRadius: 14)],
            ),
            child: const Icon(Icons.check_rounded, size: 40, color: AppColors.black),
          ),
        ),
        const SizedBox(height: 26),
        Text(
          'Contrato assinado',
          textAlign: TextAlign.center,
          style: AppTypography.soraRegular(fontSize: 23, fontWeight: FontWeight.w700, color: colors.onSurface),
        ),
        const SizedBox(height: 6),
        Text(
          '${a.arenaName} foi avisada.\n${_wall(a.signedAt)} · cópia em Contratos.',
          textAlign: TextAlign.center,
          style: AppTypography.bodyS.copyWith(color: colors.onSurfaceMuted, height: 1.45),
        ),
        const SizedBox(height: 20),
        if (a.essentials.isNotEmpty) ContractEssentialsCard(rows: a.essentials),
        const SizedBox(height: 12),
        if (a.isProfessor)
          const ScheduleBanner(
            icon: Icons.check_circle_outline_rounded,
            tone: AppColors.win,
            title: 'Pronto para receber alunos',
            message: 'Quem contratar pelo app um plano em que a arena te '
                'cadastrou pode escolher você e os seus horários.',
          ),
        const SizedBox(height: 18),
        OutlinedButton(
          style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(52)),
          onPressed: () => popOrGo(context, AppRoutes.classAgreements),
          child: const Text('Voltar'),
        ),
      ],
    );
  }
}

class _ProfessorSignSheet extends StatefulWidget {
  const _ProfessorSignSheet({required this.arenaName});

  final String arenaName;

  @override
  State<_ProfessorSignSheet> createState() => _ProfessorSignSheetState();
}

class _ProfessorSignSheetState extends State<_ProfessorSignSheet> {
  bool _agreed = false;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          ScheduleSheetHeader(
            title: 'Assinar contrato',
            subtitle: 'Contrato de professor · ${widget.arenaName}',
          ),
          const SizedBox(height: 14),
          Material(
            color: _agreed ? AppColors.brand.withValues(alpha: 0.07) : colors.surfaceCard,
            borderRadius: BorderRadius.circular(14),
            child: CheckboxListTile(
              key: const Key('class-agreement-agree'),
              value: _agreed,
              onChanged: (v) => setState(() => _agreed = v ?? false),
              activeColor: AppColors.brand,
              checkColor: AppColors.black,
              controlAffinity: ListTileControlAffinity.leading,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14),
                side: BorderSide(color: _agreed ? AppColors.brand : colors.onSurface.withValues(alpha: 0.12)),
              ),
              title: Text(
                'Li o contrato inteiro e concordo com as condições da ${widget.arenaName}.',
                style: AppTypography.bodyS.copyWith(color: colors.onSurface, height: 1.4),
              ),
            ),
          ),
          const SizedBox(height: 12),
          Text(
            'Você assina pela sua conta nexaGO. Guardamos data, hora, aparelho '
            'e a impressão digital do texto.',
            style: AppTypography.bodyS.copyWith(color: colors.onSurfaceMuted, height: 1.4),
          ),
          const SizedBox(height: 16),
          SchedulePrimaryButton(
            key: const Key('class-agreement-confirm'),
            label: 'Assinar',
            icon: Icons.draw_rounded,
            onPressed: _agreed ? () => Navigator.of(context).pop(true) : null,
          ),
        ],
      ),
    );
  }
}
