/**
 * Processa um pedido de nota: revalida, chama o emissor e grava o resultado.
 * Roda fora da transação da carteira de propósito — prefeitura fora do ar não
 * pode derrubar a confirmação de um pagamento.
 */
import {FieldValue, type Firestore} from "firebase-admin/firestore";
import {shouldProcess} from "./invoice-emitter";
import {readArenaFiscalConfig} from "./invoice-repository";
import type {FiscalIssuer} from "./issuer-port";
import type {FiscalInvoice} from "./types";

export type ReadIssuerToken = (secretName: string) => Promise<string>;

/** Uma origem só é "paga" se o documento de origem disser isso. */
async function isOriginPaid(db: Firestore, invoice: FiscalInvoice): Promise<boolean> {
  if (invoice.origin === "manual") return true;
  if (!invoice.originId) return false;
  if (invoice.origin === "booking") {
    const snap = await db.doc(`arenaBookings/${invoice.originId}`).get();
    const status = snap.data()?.paymentStatus;
    return status === "paid" || status === "partial";
  }
  // clubinho: o pedido só é criado no webhook de pagamento confirmado
  return true;
}

export async function processInvoiceRequest(
  db: Firestore,
  issuer: FiscalIssuer,
  readToken: ReadIssuerToken,
  invoiceId: string,
): Promise<void> {
  const ref = db.doc(`fiscalInvoices/${invoiceId}`);
  const snap = await ref.get();
  if (!snap.exists) return;
  const invoice = snap.data() as FiscalInvoice;
  if (invoice.status !== "requested") return;

  const config = await readArenaFiscalConfig(db, invoice.arenaId);
  const verdict = shouldProcess({
    config,
    origin: invoice.origin,
    originPaid: await isOriginPaid(db, invoice),
    valorBrutoReais: invoice.valorBrutoReais,
    tomadorCpfCnpj: invoice.tomador.cpfCnpj,
    hasAuthorizedTwin: false,
  });

  if (!verdict.ok) {
    await ref.set(
      {
        status: "rejected",
        errorMessage: verdict.reason,
        processedAt: FieldValue.serverTimestamp(),
      },
      {merge: true},
    );
    return;
  }

  const token = await readToken(config!.credentialSecretName!);
  const result = await issuer.issueServiceInvoice(token, {
    reference: invoiceId,
    prestador: {
      cnpj: config!.cnpj,
      inscricaoMunicipal: config!.inscricaoMunicipal,
      codigoIbge: config!.enderecoFiscal.codigoIbge,
    },
    tomador: invoice.tomador,
    servico: {
      valorServicos: invoice.valorBrutoReais,
      itemListaServico: invoice.codigoMunicipal,
      discriminacao: invoice.descricao,
      codigoIbge: config!.enderecoFiscal.codigoIbge,
      aliquota: invoice.aliquotaIss,
      issRetido: false,
    },
    optanteSimplesNacional: config!.regimeTributario === "simples_nacional",
  });

  await ref.set(
    {
      status: result.status === "processing" ? "processing" : result.status,
      numero: result.numero ?? null,
      serie: result.serie ?? null,
      codigoVerificacao: result.codigoVerificacao ?? null,
      pdfUrl: result.pdfUrl ?? null,
      xmlUrl: result.xmlUrl ?? null,
      errorMessage: result.errorMessage ?? null,
      processedAt: FieldValue.serverTimestamp(),
      ...(result.status === "authorized"
        ? {authorizedAt: FieldValue.serverTimestamp()}
        : {}),
    },
    {merge: true},
  );
}
