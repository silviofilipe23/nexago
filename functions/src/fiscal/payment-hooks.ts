/**
 * Ponte entre a confirmação de pagamento e o módulo fiscal. Toda função aqui
 * engole o próprio erro: a nota é consequência do pagamento, nunca condição
 * dele.
 */
import type {Firestore} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {buildIdempotencyKey, shouldAutoIssue} from "./invoice-emitter";
import {createInvoiceRequest, readArenaFiscalConfig} from "./invoice-repository";
import type {ArenaFiscalConfig, FiscalService, FiscalTomador} from "./types";

function resolveService(
  config: ArenaFiscalConfig,
  serviceId: string | undefined,
): FiscalService {
  const service = config.services?.find((s) => s.id === serviceId);
  if (!service) throw new Error("FISCAL_DEFAULT_SERVICE_MISSING");
  return service;
}

export interface PaidBookingInvoiceInput {
  arenaId: string;
  bookingId: string;
  asaasPaymentId: string;
  grossReais: number;
  tomador: FiscalTomador;
  tomadorUid: string | null;
}

export async function requestInvoiceForPaidBooking(
  db: Firestore,
  input: PaidBookingInvoiceInput,
): Promise<void> {
  try {
    const config = await readArenaFiscalConfig(db, input.arenaId);
    if (!shouldAutoIssue(config)) return;
    const service = resolveService(config!, config!.defaultServiceIdBooking);

    await createInvoiceRequest(db, {
      arenaId: input.arenaId,
      origin: "booking",
      originId: input.bookingId,
      idempotencyKey: buildIdempotencyKey({
        origin: "booking",
        asaasPaymentId: input.asaasPaymentId,
      }),
      serviceId: service.id,
      codigoMunicipal: service.codigoMunicipal,
      aliquotaIss: service.aliquotaIss,
      descricao: service.descricao,
      tomador: input.tomador,
      tomadorUid: input.tomadorUid,
      valorBrutoReais: input.grossReais,
    });
  } catch (e) {
    logger.error("requestInvoiceForPaidBooking falhou", input.bookingId, e);
  }
}

export interface PaidClubSpotInvoiceInput {
  arenaId: string;
  sessionId: string;
  participantId: string;
  asaasPaymentId: string;
  grossReais: number;
  tomador: FiscalTomador;
  tomadorUid: string | null;
}

export async function requestInvoiceForPaidClubSpot(
  db: Firestore,
  input: PaidClubSpotInvoiceInput,
): Promise<void> {
  try {
    const config = await readArenaFiscalConfig(db, input.arenaId);
    if (!shouldAutoIssue(config)) return;
    const service = resolveService(config!, config!.defaultServiceIdClub);

    await createInvoiceRequest(db, {
      arenaId: input.arenaId,
      origin: "club",
      originId: `${input.sessionId}:${input.participantId}`,
      idempotencyKey: buildIdempotencyKey({
        origin: "club",
        asaasPaymentId: input.asaasPaymentId,
      }),
      serviceId: service.id,
      codigoMunicipal: service.codigoMunicipal,
      aliquotaIss: service.aliquotaIss,
      descricao: service.descricao,
      tomador: input.tomador,
      tomadorUid: input.tomadorUid,
      valorBrutoReais: input.grossReais,
    });
  } catch (e) {
    logger.error("requestInvoiceForPaidClubSpot falhou", input.sessionId, e);
  }
}
