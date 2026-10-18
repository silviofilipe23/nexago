import { brl } from '../comissoes/data/commission';
import type { TierPackage } from '../niveis-regras/data/squad-rules';

/** Resumo do pacote de um nível (comissão · desconto · inscrições · kit), como o modal de convite mostra. */
export function packageSummary(pkg: TierPackage): Array<{ label: string; value: string }> {
  const pct = Array.isArray(pkg.commissionPct) ? `${pkg.commissionPct[0]}–${pkg.commissionPct[1]}%` : `${pkg.commissionPct}%`;
  const r = pkg.registrations;
  const registrations =
    r.type === 'discount'
      ? `${r.value}% de desconto`
      : r.type === 'freePerMonth'
        ? `${r.value} grátis por mês`
        : `Ilimitadas (teto ${r.value}/mês)`;
  return [
    { label: 'Comissão', value: pct },
    { label: 'Desconto do seguidor', value: `${pkg.followerDiscountPct}%` },
    { label: 'Inscrições', value: registrations },
    { label: 'Kit', value: pkg.kit ? `${pkg.kit} · ${brl(pkg.kitCostCents, false)}` : '—' },
  ];
}
