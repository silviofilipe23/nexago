/**
 * Quadra que entra em manutenção (gravada direto pelo portal/app em `arenas/{id}/courts/{id}`):
 * as reservas flutuantes dela, de hoje em diante, vão para outra quadra livre — a manutenção
 * desconta da capacidade do horário. Sem quadra livre, ficam onde estão e o log avisa.
 * Ver `relocateFloatingOffCourt` e `docs/product/reservas-por-capacidade.md`.
 */
import {onDocumentUpdated} from "firebase-functions/v2/firestore";
import {getFirestore} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {courtEnteredMaintenance, relocateFloatingOffCourt} from "./arena-floating-booking";
import {dayKeyFromEventDate} from "./event-timezone";

export const onArenaCourtMaintenanceRelocateFloating = onDocumentUpdated(
  "arenas/{arenaId}/courts/{courtId}",
  async (event) => {
    if (!courtEnteredMaintenance(event.data?.before.data(), event.data?.after.data())) return;
    const {arenaId, courtId} = event.params;
    const result = await relocateFloatingOffCourt(
      getFirestore(), arenaId, courtId, dayKeyFromEventDate(new Date()), Date.now(),
    );
    if (result.moved.length > 0) {
      logger.info(`courtMaintenance: ${arenaId}/${courtId} moveu ${result.moved.length} reserva(s) flutuante(s)`, result);
    }
    if (result.stuck.length > 0) {
      logger.warn(`courtMaintenance: ${arenaId}/${courtId} sem quadra livre para reserva(s) flutuante(s)`, result);
    }
  },
);
