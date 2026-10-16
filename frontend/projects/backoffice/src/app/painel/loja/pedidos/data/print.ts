import { deliveryLabel, deadlineLabel, type Order } from './order';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function label(o: Order): string {
  const pickup = o.delivery.type === 'arena';
  const items = o.items.map((i) => `<li>${i.qty}× ${esc(i.productName)} <small>${esc(i.variantLabel)} · ${esc(i.skuCode)}</small></li>`).join('');
  const dest = pickup
    ? `<div class="k">Retirada</div><div class="v">${esc(deliveryLabel(o))}</div>
       <div class="code"><span>Código</span>${esc(o.delivery.pickupCode ?? '----')}</div>
       ${o.delivery.pickupDeadline ? `<div class="s">Prazo até ${esc(deadlineLabel(o.delivery.pickupDeadline))}</div>` : ''}`
    : `<div class="k">Entrega · ${esc(o.delivery.modeName)}</div>
       <div class="v">${esc(o.delivery.address ?? '')}<br>${esc(o.delivery.city)} - ${esc(o.delivery.uf)} · ${esc(o.delivery.zip)}</div>`;
  return `<section class="label">
    <header><b>#${esc(o.number)}</b><span>nexaGO Loja</span></header>
    <div class="k">Cliente</div><div class="v">${esc(o.customer.name)}${o.customer.phone ? ` · ${esc(o.customer.phone)}` : ''}</div>
    ${dest}
    <div class="k">Itens (${o.units})</div><ul>${items}</ul>
  </section>`;
}

/** Etiquetas de envio/retirada (uma por página) numa janela própria, prontas para "Salvar como PDF". */
export function printLabels(orders: Order[]): boolean {
  const w = window.open('', '_blank', 'width=480,height=640');
  if (!w) return false;
  w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Etiquetas · ${orders.length} pedido(s)</title>
  <style>
    @page { size: 100mm 150mm; margin: 6mm; }
    body { margin: 0; font: 12px/1.35 system-ui, sans-serif; color: #000; }
    .label { page-break-after: always; border: 1px solid #000; border-radius: 6px; padding: 10px 12px; margin: 8px; }
    header { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid #000; padding-bottom: 6px; margin-bottom: 6px; }
    header b { font: 700 20px ui-monospace, monospace; }
    .k { margin-top: 8px; font-size: 9px; letter-spacing: .12em; text-transform: uppercase; color: #555; }
    .v { font-weight: 600; }
    .code { margin-top: 6px; display: inline-flex; gap: 10px; align-items: baseline; border: 2px solid #000; border-radius: 6px; padding: 4px 10px; font: 800 26px ui-monospace, monospace; letter-spacing: .15em; }
    .code span { font: 600 9px system-ui; letter-spacing: .12em; text-transform: uppercase; }
    .s { font-size: 11px; margin-top: 4px; }
    ul { margin: 4px 0 0; padding-left: 16px; } small { color: #555; }
  </style></head><body>${orders.map(label).join('')}<script>window.onload = () => { window.print(); };</script></body></html>`);
  w.document.close();
  return true;
}
