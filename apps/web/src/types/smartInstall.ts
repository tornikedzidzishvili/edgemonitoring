/**
 * Smart-install types — duplicated from apps/api/src/types/smartInstall.ts.
 * Source of truth lives in the backend; keep this file in sync if the contract
 * changes. The frontend cannot import directly from apps/api.
 */
export type HostStackProfile = {
  hasCyberPanel: boolean;
  hasDocker: boolean;
  hasDockerBuildKit: boolean;
  hasSystemd: boolean;
  distro: string;
};

export type DetectStackResponse = {
  profile: HostStackProfile;
  recommendedMode: "agent" | "agent_systemd";
};
