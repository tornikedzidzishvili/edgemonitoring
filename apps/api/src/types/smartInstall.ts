/**
 * Shared types for the smart-install flow (EMS-47 / EMS-49).
 *
 * `HostStackProfile` is re-exported here so the frontend (EMS-49) has a
 * single documented source to duplicate from. The frontend cannot import
 * directly from apps/api, so it copies this type by hand and adds a comment
 * pointing back to this file.
 *
 * Source of truth: `apps/api/src/services/hostStackDetector.ts`.
 * This file re-exports only — do not add logic here.
 */

import type { HostStackProfile } from "../services/hostStackDetector.js";

// Re-export so consumers can import from this single location.
export type { HostStackProfile };

/**
 * Response shape for POST /admin/servers/:id/detect-stack.
 *
 * Frontend (EMS-49) duplicates this type. Keep any changes here in sync with
 * the frontend's local copy.
 */
export type DetectStackResponse = {
  profile: HostStackProfile;
  recommendedMode: "agent" | "agent_systemd";
};
