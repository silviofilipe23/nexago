/**
 * Bloqueio de quadra gravado direto pelo app/portal (`arenaSlots` com `status: "blocked"`, sem
 * function no meio): as reservas flutuantes que estavam na quadra naquele horário vão para outra
 * quadra livre. Sem quadra livre, ficam onde estão e o log avisa — a recepção resolve na hora.
 * Ver `relocateFloatingFromBlock` e `docs/product/reservas-por-capacidade.md`.
 */
import {onDocumentCreated} from "firebase-functions/v2/firestore";
import {getFirestore} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {isManagerCourtBlock, relocateFloatingFromBlock} from "./arena-floating-booking";

export const onArenaCourtBlockedRelocateFloating = onDocumentCreated(
  "arenaSlots/{slotId}",
  async (event) => {
    const data = event.data?.data();
    if (!isManagerCourtBlock(data)) return;
    const result = await relocateFloatingFromBlock(getFirestore(), data!, Date.now());
    if (result.moved.length > 0) {
      logger.info(`courtBlock: ${event.params.slotId} moveu ${result.moved.length} reserva(s) flutuante(s)`, result);
    }
    if (result.stuck.length > 0) {
      logger.warn(`courtBlock: ${event.params.slotId} sem quadra livre para reserva(s) flutuante(s)`, result);
    }
  },
);
