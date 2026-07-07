import { describe, it, expect } from "vitest";
import { OPERATIONAL_SESSION_STATE } from "../constants/EstadosOperationalSession.js";
import { OPERATIONAL_SESSION_KIND } from "../constants/TiposOperationalSession.js";
import { OPERATIONAL_SESSION_EVENT } from "../constants/EventosOperationalSession.js";
import {
  openOperationalSession,
  openOperationalSessionGuarded,
  registerMovementInOperationalSession,
  closeOperationalSession,
  cancelOperationalSession,
} from "../aggregate/OperationalSession.js";
import { BusinessRuleError } from "../../shared/BusinessRuleError.js";

const NOW = "2026-06-28T14:00:00.000Z";
const LOCATION = { locationId: null, name: "Muelle 1", address: "Pol. Ind.", role: "dock" };

describe("OperationalSession aggregate", () => {
  it("opens session in OPEN state with domain event", () => {
    const { session, events } = openOperationalSession({
      id: "os-1",
      expeditionId: "srv-1",
      sessionKind: OPERATIONAL_SESSION_KIND.LOAD,
      location: LOCATION,
      actor: { userId: "user-1", role: "conductor" },
      now: NOW,
    });

    expect(session.state).toBe(OPERATIONAL_SESSION_STATE.OPEN);
    expect(session.expeditionId).toBe("srv-1");
    expect(session.movementRefs).toEqual([]);
    expect(events[0].type).toBe(OPERATIONAL_SESSION_EVENT.OPENED);
  });

  it("registers movement ref while session is open", () => {
    const { session } = openOperationalSession({
      id: "os-2",
      expeditionId: "srv-2",
      location: LOCATION,
      now: NOW,
    });
    const { session: withMovement, events } = registerMovementInOperationalSession(
      session,
      {
        sessionMovementId: "carga-1",
        decaMovimientoId: "mov-1",
        tipoSesion: "carga",
        estado: "vigente",
        registeredAt: NOW,
      },
      NOW
    );

    expect(withMovement.movementRefs).toHaveLength(1);
    expect(events[0].type).toBe(OPERATIONAL_SESSION_EVENT.MOVEMENT_REGISTERED);
  });

  it("rejects movement on closed session", () => {
    const { session } = openOperationalSession({
      id: "os-3",
      expeditionId: "srv-3",
      location: LOCATION,
      now: NOW,
    });
    const { session: closed } = closeOperationalSession(session, { now: NOW });

    expect(() =>
      registerMovementInOperationalSession(closed, {
        sessionMovementId: "carga-x",
        decaMovimientoId: "mov-x",
        tipoSesion: "carga",
        estado: "vigente",
        registeredAt: NOW,
      })
    ).toThrow(BusinessRuleError);
  });

  it("closes open session", () => {
    const { session } = openOperationalSession({
      id: "os-4",
      expeditionId: "srv-4",
      location: LOCATION,
      now: NOW,
    });
    const { session: closed, events } = closeOperationalSession(session, {
      exitObservation: "OK",
      durationMinutes: 45,
      now: NOW,
    });

    expect(closed.state).toBe(OPERATIONAL_SESSION_STATE.CLOSED);
    expect(closed.durationMinutes).toBe(45);
    expect(events[0].type).toBe(OPERATIONAL_SESSION_EVENT.CLOSED);
  });

  it("cancels open session", () => {
    const { session } = openOperationalSession({
      id: "os-5",
      expeditionId: "srv-5",
      location: LOCATION,
      now: NOW,
    });
    const { session: cancelled } = cancelOperationalSession(session, "Error entrada", NOW);
    expect(cancelled.state).toBe(OPERATIONAL_SESSION_STATE.CANCELLED);
  });

  it("guards concurrent open session at same location", () => {
    const { session: active } = openOperationalSession({
      id: "os-6",
      expeditionId: "srv-6",
      location: LOCATION,
      now: NOW,
    });

    expect(() =>
      openOperationalSessionGuarded(active, {
        expeditionId: "srv-6",
        location: LOCATION,
      })
    ).toThrow(BusinessRuleError);
  });
});
