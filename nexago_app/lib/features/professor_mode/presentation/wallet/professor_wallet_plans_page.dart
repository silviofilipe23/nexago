import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/formatting/app_currency_format.dart';
import '../../../../core/router/navigation_helpers.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../arena/presentation/aulas/widgets/arena_class_form_atoms.dart';
import '../../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../application/professor_wallet_providers.dart';
import '../../domain/professor_wallet.dart';
import '../../domain/professor_wallet_logic.dart';
import '../widgets/professor_students_widgets.dart';
import 'professor_wallet_widgets.dart';

/// B14 Meus planos e preços: os preços que o professor cobra dos alunos da
/// carteira. "+" cria, toque edita, o interruptor ativa/desativa.
class ProfessorWalletPlansPage extends ConsumerWidget {
  const ProfessorWalletPlansPage({super.key});

  Future<void> _toggle(
    BuildContext context,
    WidgetRef ref,
    ProfessorWalletPlan plan,
    bool active,
  ) =>
      runProfessorWalletAction(
        context,
        () => ref
            .read(professorWalletRepositoryProvider)
            .upsertPlan(ProfessorPlanInput.of(plan, active: active)),
        message: active ? 'Plano ativado.' : 'Plano desativado.',
      );

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(professorWalletPlansProvider);
    final plans = async.valueOrNull;
    final students =
        ref.watch(professorWalletStudentsProvider).valueOrNull ?? const [];
    return ProfessorLinksScaffold(
      title: 'Meus planos e preços',
      subtitle: 'CARTEIRA INDEPENDENTE',
      onBack: () => popOrGo(context, AppRoutes.professorMore),
      trailing: ProfessorLinksRoundButton(
        key: const Key('professor-plans-add'),
        icon: Icons.add_rounded,
        filled: true,
        semanticLabel: 'Novo plano',
        onTap: () => showProfessorPlanEditor(context),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
        children: [
          const ProfessorLinksNote(
            'Você define os preços para os alunos da sua carteira. Nas '
            'arenas em que você é da equipe valem os preços da tabela da '
            'arena.',
            tone: ProfessorLinksNoteTone.blue,
          ),
          const SizedBox(height: 14),
          if (plans == null && async.hasError)
            ProfessorRetryCard(
              message: 'Não foi possível carregar seus planos.',
              onRetry: () => ref.invalidate(professorWalletPlansProvider),
            )
          else if (plans == null)
            const ProfessorWalletLoading()
          else if (plans.isEmpty)
            const ProfessorLinksCard(
              key: Key('professor-plans-empty'),
              child: ProfessorMutedText(
                'Nenhum plano ainda. Toque em "+" para criar a aula avulsa, '
                'um pacote ou a mensalidade.',
              ),
            )
          else
            for (final p in plans) ...[
              _PlanCard(
                plan: p,
                students: professorPlanStudentCount(p, students),
                onTap: () => showProfessorPlanEditor(context, plan: p),
                onToggle: (v) => _toggle(context, ref, p, v),
              ),
              const SizedBox(height: 10),
            ],
          const SizedBox(height: 8),
          const ProfessorLinksKicker('Cobrança'),
          const SizedBox(height: 8),
          const ProfessorRowsBlock(
            children: [
              ProfessorInfoRow(
                label: 'Recebimento',
                value: 'PIX ou cartão',
                sub: 'Cai direto na sua conta Asaas',
              ),
              ProfessorInfoRow(
                label: 'Taxa nexaGO',
                value: '$kProfessorChargeFeePercent%',
                sub: 'mais a tarifa do Asaas',
              ),
              ProfessorInfoRow(
                label: 'Multa por atraso',
                value: '2% + 1% a.m.',
                last: true,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _PlanCard extends StatelessWidget {
  const _PlanCard({
    required this.plan,
    required this.students,
    required this.onTap,
    required this.onToggle,
  });

  final ProfessorWalletPlan plan;
  final int students;
  final VoidCallback onTap;
  final ValueChanged<bool> onToggle;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final p = plan;
    return Opacity(
      opacity: p.active ? 1 : 0.6,
      child: ProfessorLinksCard(
        key: Key('professor-plan-${p.id}'),
        onTap: onTap,
        child: Column(
          children: [
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        p.name,
                        style: ProfessorLinksStyle.display(
                          14.5,
                          weight: FontWeight.w700,
                          color: colors.onSurface,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        professorPlanSubtitle(p),
                        style: AppTypography.bodyS.copyWith(
                          fontSize: 11.5,
                          color: ProfessorLinksStyle.dim(colors),
                        ),
                      ),
                    ],
                  ),
                ),
                Text(
                  formatBRL(p.priceReais),
                  style: ProfessorLinksStyle.display(
                    17,
                    color: colors.onSurface,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Divider(height: 1, color: ProfessorLinksStyle.line(colors)),
            Row(
              children: [
                Expanded(
                  child: Text(
                    p.active
                        ? '$students ALUNO${students == 1 ? '' : 'S'}'
                        : 'DESATIVADO',
                    style: ProfessorLinksStyle.mono(
                      10,
                      color: ProfessorLinksStyle.dim(colors),
                    ),
                  ),
                ),
                Switch(
                  key: Key('professor-plan-toggle-${p.id}'),
                  value: p.active,
                  activeThumbColor: ProfessorLinksStyle.onBrand,
                  activeTrackColor: AppColors.brand,
                  onChanged: onToggle,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// Abre o editor (sem [plan] cria).
Future<void> showProfessorPlanEditor(
  BuildContext context, {
  ProfessorWalletPlan? plan,
}) =>
    showProfessorLinksSheet<void>(
      context,
      builder: (_) => ProfessorPlanEditorSheet(plan: plan),
    );

class ProfessorPlanEditorSheet extends ConsumerStatefulWidget {
  const ProfessorPlanEditorSheet({super.key, this.plan});

  final ProfessorWalletPlan? plan;

  @override
  ConsumerState<ProfessorPlanEditorSheet> createState() =>
      _ProfessorPlanEditorSheetState();
}

class _ProfessorPlanEditorSheetState
    extends ConsumerState<ProfessorPlanEditorSheet> {
  late final _name = TextEditingController(text: widget.plan?.name ?? '');
  late final _price = TextEditingController(
    text: widget.plan == null
        ? ''
        : formatBRL(widget.plan!.priceReais).replaceAll(RegExp(r'[R$\s ]'), ''),
  );
  late final _classes =
      TextEditingController(text: widget.plan?.classes?.toString() ?? '');
  late final _validity = TextEditingController(
    text: widget.plan?.validityDays?.toString() ?? '45',
  );
  late ProfessorPlanKind _kind = widget.plan?.kind ?? ProfessorPlanKind.single;
  String? _error;
  bool _saving = false;

  @override
  void dispose() {
    _name.dispose();
    _price.dispose();
    _classes.dispose();
    _validity.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final price = professorParseMoney(_price.text);
    final classes = int.tryParse(_classes.text.trim());
    final validity = int.tryParse(_validity.text.trim());
    final error = validateProfessorPlan(
      name: _name.text,
      kind: _kind,
      priceReais: price,
      classes: classes,
      validityDays: validity,
    );
    setState(() => _error = error);
    if (error != null) return;
    setState(() => _saving = true);
    final navigator = Navigator.of(context);
    final ok = await runProfessorWalletAction(
      context,
      () => ref.read(professorWalletRepositoryProvider).upsertPlan(
            ProfessorPlanInput(
              planId: widget.plan?.id,
              name: _name.text.trim(),
              kind: _kind,
              priceReais: price!,
              classes: _kind == ProfessorPlanKind.single ? null : classes,
              validityDays:
                  _kind == ProfessorPlanKind.package ? validity : null,
              active: widget.plan?.active ?? true,
            ),
          ),
      message: widget.plan == null ? 'Plano criado.' : 'Plano salvo.',
    );
    if (!mounted) return;
    if (ok) {
      navigator.pop();
    } else {
      setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    const gap = SizedBox(height: 14);
    final digits = [FilteringTextInputFormatter.digitsOnly];
    return ProfessorLinksSheetBody(
      title: widget.plan == null ? 'Novo plano' : 'Editar plano',
      subtitle: 'Preço para os alunos da sua carteira',
      children: [
        const SizedBox(height: 14),
        ProfessorWalletField(
          key: const Key('professor-plan-name'),
          label: 'Nome',
          hint: 'Ex.: Mensal 8 aulas',
          controller: _name,
          maxLength: 60,
          textCapitalization: TextCapitalization.sentences,
        ),
        gap,
        const ProfessorLinksKicker('Tipo'),
        const SizedBox(height: 8),
        Wrap(
          spacing: 6,
          runSpacing: 6,
          children: [
            for (final k in ProfessorPlanKind.values)
              ArenaClassChip(
                key: Key('professor-plan-kind-${k.name}'),
                label: professorPlanKindLabel(k),
                selected: _kind == k,
                onTap: () => setState(() => _kind = k),
              ),
          ],
        ),
        gap,
        ProfessorWalletField(
          key: const Key('professor-plan-price'),
          label: 'Preço (R\$)',
          hint: 'Ex.: 140',
          controller: _price,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
        ),
        if (_kind != ProfessorPlanKind.single) ...[
          gap,
          ProfessorWalletField(
            key: const Key('professor-plan-classes'),
            label: _kind == ProfessorPlanKind.monthly
                ? 'Aulas por mês'
                : 'Aulas no pacote',
            hint: 'Ex.: 8',
            controller: _classes,
            keyboardType: TextInputType.number,
            inputFormatters: digits,
            maxLength: 2,
          ),
        ],
        if (_kind == ProfessorPlanKind.package) ...[
          gap,
          ProfessorWalletField(
            key: const Key('professor-plan-validity'),
            label: 'Validade (dias)',
            controller: _validity,
            keyboardType: TextInputType.number,
            inputFormatters: digits,
            maxLength: 3,
          ),
        ],
        if (_error != null) ...[
          gap,
          ProfessorLinksNote(
            _error!,
            key: const Key('professor-plan-error'),
            tone: ProfessorLinksNoteTone.red,
          ),
        ],
        const SizedBox(height: 18),
        ProfessorLinksPrimaryButton(
          key: const Key('professor-plan-save'),
          label: widget.plan == null ? 'Criar plano' : 'Salvar',
          loading: _saving,
          onPressed: _save,
        ),
      ],
    );
  }
}
