import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { db } from "@/db"
import { requireAdmin, requireUser } from "@/server/auth/middleware"
import * as selection from "@/server/services/selection"

export const getSelection = createServerFn()
  .middleware([requireUser])
  .validator(z.object({ eventId: z.string() }))
  .handler(({ data }) => selection.getSelectionState(db, data.eventId))

export const selectionInvite = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(z.object({ eventId: z.string(), teamId: z.string() }))
  .handler(({ data, context }) =>
    selection.applySelectionAction(
      db,
      data.eventId,
      { type: "invite", teamId: data.teamId },
      context.user.id
    )
  )

export const selectionUndo = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(z.object({ eventId: z.string() }))
  .handler(({ data, context }) =>
    selection.applySelectionAction(
      db,
      data.eventId,
      { type: "undo" },
      context.user.id
    )
  )

/**
 * Add or clear an alliance's playoff backup robot. `teamId: null` removes it.
 */
export const setSelectionBackup = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(
    z.object({
      eventId: z.string(),
      allianceNumber: z.number().int().positive(),
      teamId: z.string().nullable(),
    })
  )
  .handler(({ data }) =>
    selection.setAllianceBackup(
      db,
      data.eventId,
      data.allianceNumber,
      data.teamId
    )
  )

/**
 * Accept/decline the pending invitation. Admins can respond on a team's
 * behalf; a team account may only respond to its own invitation.
 */
export const selectionRespond = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(
    z.object({ eventId: z.string(), response: z.enum(["accept", "decline"]) })
  )
  .handler(({ data, context }) => {
    if (context.user.role !== "admin") {
      const state = selection.getSelectionState(db, data.eventId)
      if (
        !state.pendingInvite ||
        state.pendingInvite.team.teamId !== context.user.teamId
      ) {
        throw new Error("This invitation is not addressed to your team")
      }
    }
    return selection.applySelectionAction(
      db,
      data.eventId,
      { type: data.response },
      context.user.id
    )
  })
