/** Callback do emissor: a prefeitura responde depois, não na hora da chamada. */
import {onRequest} from "firebase-functions/v2/https";
import {defineSecret} from "firebase-functions/params";
import {FieldValue, getFirestore, type Firestore} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";

export const FISCAL_WEBHOOK_TOKEN = defineSecret("FISCAL_WEBHOOK_TOKEN");

export interface IssuerNotification {
  ref: string;
  status: string;
  numero?: string;
  serie?: string;
  codigo_verificacao?: string;
  url_danfse?: string;
  caminho_xml_nota_fiscal?: string;
  mensagem?: string;
}

const FINAL_STATUSES = new Set(["authorized", "cancelled"]);

export async function applyIssuerNotification(
  db: Firestore,
  payload: IssuerNotification,
): Promise<void> {
  const ref = db.doc(`fiscalInvoices/${payload.ref}`);
  const snap = await ref.get();
  if (!snap.exists) return;
  if (FINAL_STATUSES.has(String(snap.data()?.status))) return;

  if (payload.status === "autorizado") {
    await ref.set(
      {
        status: "authorized",
        numero: payload.numero ?? null,
        serie: payload.serie ?? null,
        codigoVerificacao: payload.codigo_verificacao ?? null,
        pdfUrl: payload.url_danfse ?? null,
        xmlUrl: payload.caminho_xml_nota_fiscal ?? null,
        errorMessage: null,
        authorizedAt: FieldValue.serverTimestamp(),
      },
      {merge: true},
    );
    return;
  }

  if (payload.status === "erro_autorizacao" || payload.status === "cancelado") {
    await ref.set(
      {
        status: payload.status === "cancelado" ? "cancelled" : "rejected",
        errorMessage: payload.mensagem ?? null,
        ...(payload.status === "cancelado"
          ? {cancelledAt: FieldValue.serverTimestamp()}
          : {}),
      },
      {merge: true},
    );
    return;
  }

  logger.warn(
    `Unrecognized issuer status for invoice ${payload.ref}: ${payload.status}`,
  );
}

export const fiscalIssuerWebhook = onRequest(
  {secrets: [FISCAL_WEBHOOK_TOKEN]},
  async (req, res) => {
    if (req.get("x-fiscal-token") !== FISCAL_WEBHOOK_TOKEN.value()) {
      res.status(401).send("unauthorized");
      return;
    }
    try {
      await applyIssuerNotification(getFirestore(), req.body as IssuerNotification);
      res.status(200).send("ok");
    } catch (e) {
      logger.error("fiscalIssuerWebhook falhou", e);
      res.status(500).send("error");
    }
  },
);
