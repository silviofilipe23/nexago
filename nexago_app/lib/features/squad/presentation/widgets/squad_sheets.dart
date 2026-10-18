import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../../core/ui/app_snackbar.dart';
import '../../application/squad_providers.dart';
import '../../domain/squad_models.dart';
import '../../domain/squad_repository.dart';
import '../../domain/squad_rules.dart';
import 'squad_ui.dart';

/// Lista de benefícios do pacote (App 05 e 06, folha do aditivo).
class SquadBenefitList extends StatelessWidget {
  const SquadBenefitList({
    super.key,
    required this.benefits,
    this.status,
    this.dividers = true,
  });

  final List<SquadBenefit> benefits;

  /// "ATIVO"/"PAUSADO" à direita (App 05); `null` não mostra.
  final String? status;
  final bool dividers;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Column(
      children: [
        for (var i = 0; i < benefits.length; i++)
          Container(
            padding: EdgeInsets.symmetric(vertical: dividers ? 13 : 10),
            decoration: BoxDecoration(
              border: dividers && i > 0
                  ? Border(top: BorderSide(color: SquadStyle.line(colors)))
                  : null,
            ),
            child: Row(
              children: [
                SquadIconTile(squadBenefitIcon(benefits[i].kind)),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        benefits[i].title,
                        style: SquadStyle.display(
                          14,
                          color: colors.onSurface,
                          weight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 1),
                      Text(
                        benefits[i].subtitle,
                        style: AppTypography.bodyS.copyWith(
                          color: SquadStyle.dim(colors),
                        ),
                      ),
                    ],
                  ),
                ),
                if (status != null) ...[
                  const SizedBox(width: 8),
                  Text(
                    status!.toUpperCase(),
                    style: SquadStyle.mono(
                      9.5,
                      color: status == 'Ativo'
                          ? AppColors.win
                          : SquadStyle.dim(colors),
                    ).copyWith(letterSpacing: 1),
                  ),
                ],
              ],
            ),
          ),
      ],
    );
  }
}

/// Aditivo esperando o aceite (mudança de nível feita pelo time).
class SquadAmendmentCard extends StatelessWidget {
  const SquadAmendmentCard({super.key, required this.amendment});

  final SquadAmendment amendment;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final tier = amendment.package.tier;
    return SquadCard(
      hot: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SquadLabel('Aditivo do contrato', color: AppColors.brand),
          const SizedBox(height: 6),
          Text(
            'Você foi convidado para ${tier.label}.',
            style: SquadStyle.display(
              17,
              color: colors.onSurface,
              weight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            'Até você aceitar, seu contrato segue no nível atual.',
            style: AppTypography.bodyS.copyWith(color: SquadStyle.mute(colors)),
          ),
          const SizedBox(height: 12),
          OutlinedButton(
            key: const Key('squad-amendment-open'),
            onPressed: () => showSquadAmendmentSheet(context, amendment),
            child: const Text('Ver e aceitar'),
          ),
        ],
      ),
    );
  }
}

Future<void> showSquadAmendmentSheet(
  BuildContext context,
  SquadAmendment amendment,
) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: context.themeColors.surfaceSheet,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
    ),
    builder: (_) => _AmendmentSheet(amendment: amendment),
  );
}

class _AmendmentSheet extends ConsumerStatefulWidget {
  const _AmendmentSheet({required this.amendment});

  final SquadAmendment amendment;

  @override
  ConsumerState<_AmendmentSheet> createState() => _AmendmentSheetState();
}

class _AmendmentSheetState extends ConsumerState<_AmendmentSheet> {
  bool _saving = false;

  Future<void> _accept() async {
    setState(() => _saving = true);
    final messenger = ScaffoldMessenger.maybeOf(context);
    try {
      await ref.read(squadRepositoryProvider).acceptAmendment();
      ref.invalidate(mySquadProvider);
      if (!mounted) return;
      Navigator.of(context).pop();
      messenger?.showSnackBar(
        SnackBar(
          content: Text(
            'Pronto: agora você é ${widget.amendment.package.tier.label}.',
          ),
        ),
      );
    } on SquadException catch (e) {
      if (!mounted) return;
      setState(() => _saving = false);
      showAppSnackBar(context, e.message);
    } catch (_) {
      if (!mounted) return;
      setState(() => _saving = false);
      showAppSnackBar(
        context,
        'Não foi possível concluir agora. Tente de novo em instantes.',
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final pkg = widget.amendment.package;
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          SquadTierBadge(pkg.tier, solid: true),
          const SizedBox(height: 12),
          Text(
            'Aditivo: nível ${pkg.tier.label}',
            style: SquadStyle.display(22, color: colors.onSurface),
          ),
          const SizedBox(height: 6),
          Text(
            'Ao aceitar, o pacote abaixo passa a valer no seu contrato. As '
            'comissões já registradas seguem como estão.',
            style: AppTypography.bodyM.copyWith(color: SquadStyle.mute(colors)),
          ),
          const SizedBox(height: 8),
          SquadBenefitList(benefits: squadBenefits(pkg), dividers: false),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: SquadPrimaryButton(
              label: 'Aceitar aditivo',
              loading: _saving,
              onPressed: _accept,
            ),
          ),
          const SizedBox(height: 8),
          Center(
            child: TextButton(
              onPressed: _saving ? null : () => Navigator.of(context).pop(),
              child: const Text('Agora não'),
            ),
          ),
        ],
      ),
    );
  }
}

/// Resumo das regras do contrato (App 05 "Ver contrato" e App 06 "contrato do
/// piloto"). Sai das regras travadas do programa e do pacote do nível.
Future<void> showSquadContractSheet(
  BuildContext context, {
  required SquadPackage package,
  required bool followerDiscountFirstOnly,
  String? periodLabel,
}) {
  final colors = context.themeColors;
  final clauses = squadContractClauses(
    package: package,
    followerDiscountFirstOnly: followerDiscountFirstOnly,
    periodLabel: periodLabel,
  );
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: colors.surfaceSheet,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
    ),
    builder: (sheetContext) => SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 22, 20, 28),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            'Contrato do NexaSquad',
            style: SquadStyle.display(22, color: colors.onSurface),
          ),
          const SizedBox(height: 6),
          Text(
            'Resumo das regras que valem no seu contrato.',
            style: AppTypography.bodyM.copyWith(color: SquadStyle.mute(colors)),
          ),
          const SizedBox(height: 14),
          for (final clause in clauses)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Padding(
                    padding: EdgeInsets.only(top: 6),
                    child: Icon(Icons.circle, size: 6, color: AppColors.brand),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      clause,
                      style: AppTypography.bodyM.copyWith(
                        color: colors.onSurface,
                        height: 1.5,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          const SizedBox(height: 4),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton(
              onPressed: () => Navigator.of(sheetContext).pop(),
              child: const Text('Fechar'),
            ),
          ),
        ],
      ),
    ),
  );
}

/// Cláusulas do resumo — puras para o teste conferir o texto.
List<String> squadContractClauses({
  required SquadPackage package,
  required bool followerDiscountFirstOnly,
  String? periodLabel,
}) {
  final commission = package.commissionIsRange
      ? '${squadPercent(package.commissionMin)} a ${squadPercent(package.commissionMax)} (o valor exato fica no contrato)'
      : squadPercent(package.commissionMin);
  final discount = squadPercent(package.followerDiscountPct);
  return [
    'Nível ${package.tier.label}${periodLabel == null ? '' : ' · $periodLabel'}.',
    'Comissão de $commission sobre cada inscrição paga com o seu código, link '
        'ou QR. Ela só vale com o pagamento confirmado; reembolso ou estorno '
        'cancela a comissão.',
    'Quem usar o seu código ganha $discount de desconto'
        '${followerDiscountFirstOnly ? ' na primeira inscrição' : ''}. O '
        'desconto sai da taxa da NexaGO: o organizador recebe o mesmo valor.',
    'As comissões liberadas caem na carteira NexaGO nos dias de repasse do '
        'programa.',
    'Ao divulgar, identifique a parceria com #publi.',
    'Você autoriza o uso da sua imagem nas peças do NexaSquad durante o '
        'contrato.',
  ];
}
