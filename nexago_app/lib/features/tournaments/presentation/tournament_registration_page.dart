import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/ui/app_snackbar.dart';
import '../data/tournament_registration_service.dart';
import '../domain/tournament_discovery_models.dart';
import '../domain/tournament_discovery_providers.dart';

class TournamentRegistrationPage extends ConsumerStatefulWidget {
  const TournamentRegistrationPage({super.key, required this.tournamentId});

  final String tournamentId;

  @override
  ConsumerState<TournamentRegistrationPage> createState() =>
      _TournamentRegistrationPageState();
}

class _TournamentRegistrationPageState
    extends ConsumerState<TournamentRegistrationPage> {
  int _step = 0;
  TournamentCategoryOffer? _category;
  String _paymentType = 'share';
  bool _submitting = false;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final tournamentAsync =
        ref.watch(tournamentDetailProvider(widget.tournamentId));

    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: AppBar(
        backgroundColor: AppColors.canvas,
        title: const Text('Inscrição'),
      ),
      body: tournamentAsync.when(
        loading: () => const Center(
          child: CircularProgressIndicator(color: AppColors.brand),
        ),
        error: (e, _) => Center(child: Text('Erro: $e')),
        data: (tournament) {
          if (tournament == null) {
            return const Center(child: Text('Torneio não encontrado.'));
          }
          final categories = tournament.categoryOffers;
          if (categories.isEmpty) {
            return const Center(
              child: Text('Nenhuma categoria disponível para inscrição.'),
            );
          }

          return ListView(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
            children: [
              Text(
                tournament.name,
                style: theme.textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: AppColors.onSurface,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                _step == 0
                    ? 'Escolha a categoria'
                    : _step == 1
                        ? 'Confirme e pague'
                        : 'Pagamento',
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: AppColors.onSurfaceMuted,
                ),
              ),
              const SizedBox(height: 20),
              if (_step == 0) ...[
                for (final cat in categories)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: ListTile(
                      tileColor: AppColors.surfaceRaised,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                        side: BorderSide(
                          color: _category?.id == cat.id
                              ? AppColors.brand
                              : AppColors.onSurfaceMuted
                                  .withValues(alpha: 0.15),
                        ),
                      ),
                      title: Text(
                        cat.name,
                        style: const TextStyle(
                          fontWeight: FontWeight.w700,
                          color: AppColors.onSurface,
                        ),
                      ),
                      subtitle: Text(
                        'R\$ ${cat.entryFee.toStringAsFixed(0)} · ${cat.spotsLeft} vagas',
                        style: const TextStyle(color: AppColors.onSurfaceMuted),
                      ),
                      onTap: () => setState(() => _category = cat),
                      trailing: _category?.id == cat.id
                          ? const Icon(Icons.check_circle, color: AppColors.brand)
                          : null,
                    ),
                  ),
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: _category == null
                      ? null
                      : () => setState(() => _step = 1),
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.brand,
                    foregroundColor: AppColors.black,
                  ),
                  child: const Text('Continuar'),
                ),
              ],
              if (_step == 1) ...[
                if (_category != null)
                  Text(
                    'Categoria: ${_category!.name} — R\$ ${_category!.entryFee.toStringAsFixed(0)}',
                    style: theme.textTheme.bodyLarge?.copyWith(
                      color: AppColors.onSurface,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                const SizedBox(height: 16),
                SegmentedButton<String>(
                  segments: const [
                    ButtonSegment(
                      value: 'share',
                      label: Text('Minha parte'),
                    ),
                    ButtonSegment(
                      value: 'full',
                      label: Text('Integral'),
                    ),
                  ],
                  selected: {_paymentType},
                  onSelectionChanged: (s) {
                    if (s.isEmpty) return;
                    setState(() => _paymentType = s.first);
                  },
                ),
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: _submitting ? null : () => _submit(tournament),
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.brand,
                    foregroundColor: AppColors.black,
                  ),
                  child: _submitting
                      ? const SizedBox(
                          width: 22,
                          height: 22,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Text('Confirmar e pagar'),
                ),
              ],
            ],
          );
        },
      ),
    );
  }

  Future<void> _submit(DiscoveryTournament tournament) async {
    final cat = _category;
    if (cat == null) return;

    setState(() => _submitting = true);
    final service = ref.read(tournamentRegistrationServiceProvider);

    try {
      final reg = await service.createRegistration(
        tournamentId: tournament.id,
        categoryId: cat.id,
      );
      final payment = await service.createMercadoPagoPreference(
        registrationId: reg.registrationId,
        amountType: _paymentType,
      );
      await service.openCheckout(payment.initPoint);
      if (!mounted) return;
      showAppSnackBar(
        context,
        'Complete o pagamento no navegador para confirmar sua inscrição.',
      );
      Navigator.of(context).pop();
    } on TournamentRegistrationException catch (e) {
      if (!mounted) return;
      showAppSnackBar(context, e.message, isError: true);
    } catch (_) {
      if (!mounted) return;
      showAppSnackBar(
        context,
        'Não foi possível concluir a inscrição. Tente novamente.',
        isError: true,
      );
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }
}
