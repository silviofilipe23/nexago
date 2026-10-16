/**
 * Avisos de pedido da Loja ao cliente (push + inbox do app). Fica fora de
 * `store-orders-write.ts` para o recebimento da remessa (store-stock-write)
 * poder avisar sem importar o módulo de pedidos de volta.
 */
import * as logger from "firebase-functions/logger";
import {
  WEB_PUSH_PRIVATE_KEY,
  WEB_PUSH_PUBLIC_KEY,
  WEB_PUSH_SUBJECT,
  deliverNotificationToUser,
} from "./notification-delivery";
import type {OrderNotice} from "./store-orders";

export const ORDER_NOTIFY_SECRETS = [WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT];

const TITLE: Record<OrderNotice["kind"], string> = {
  pickup_code: "Pedido pronto para retirar",
  payment: "Pagamento pendente",
  shipped: "Pedido a caminho",
  canceled: "Pedido cancelado",
};

/** Melhor esforço: o pedido já mudou; aviso que falha só vai para o log. */
export async function notifyOrderCustomer(notice: OrderNotice): Promise<{sent: number}> {
  if (!notice.uid) return {sent: 0};
  try {
    const result = await deliverNotificationToUser({
      userId: notice.uid,
      title: TITLE[notice.kind],
      body: notice.body,
      type: `store_order_${notice.kind}`,
      data: {orderId: notice.orderId, number: notice.number},
    });
    return {sent: result.sent};
  } catch (err) {
    logger.warn("Aviso de pedido da Loja falhou", {orderId: notice.orderId, kind: notice.kind, err});
    return {sent: 0};
  }
}
