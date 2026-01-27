import speakeasy from "speakeasy";
import qrcode from "qrcode";

export interface TwoFactorSetup {
  secret: string;
  qrCodeUrl: string;
}

/**
 * Generate a new 2FA secret and QR code for a user
 */
export async function generateTwoFactorSecret(userEmail: string): Promise<TwoFactorSetup> {
  const secret = speakeasy.generateSecret({
    name: `Edge Monitoring (${userEmail})`,
    issuer: "Edge Monitoring",
    length: 32
  });

  if (!secret.otpauth_url) {
    throw new Error("Failed to generate OTP auth URL");
  }

  const qrCodeUrl = await qrcode.toDataURL(secret.otpauth_url);

  return {
    secret: secret.base32,
    qrCodeUrl
  };
}

/**
 * Verify a 2FA token against a secret
 */
export function verifyTwoFactorToken(token: string, secret: string): boolean {
  return speakeasy.totp.verify({
    secret,
    encoding: "base32",
    token,
    window: 2 // Allow 2 time steps of drift
  });
}
