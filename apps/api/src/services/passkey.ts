import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type VerifiedRegistrationResponse,
  type VerifiedAuthenticationResponse,
  type RegistrationResponseJSON,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture
} from "@simplewebauthn/server";

const RP_NAME = "Edge Monitoring";
const RP_ID = process.env.RP_ID || "localhost";
const ORIGIN = process.env.ORIGIN || "http://localhost:5173";

export interface PasskeyRegistrationOptions {
  userId: string;
  userName: string;
  userEmail: string;
  existingCredentials: Array<{
    id: string;
    transports?: AuthenticatorTransportFuture[];
  }>;
}

export interface PasskeyAuthenticationOptions {
  allowCredentials?: Array<{
    id: string;
    transports?: AuthenticatorTransportFuture[];
  }>;
}

/**
 * Generate registration options for creating a new passkey
 */
export async function generatePasskeyRegistrationOptions(
  options: PasskeyRegistrationOptions
) {
  return await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userID: new TextEncoder().encode(options.userId),
    userName: options.userEmail,
    userDisplayName: options.userName,
    attestationType: "none",
    excludeCredentials: options.existingCredentials.map((cred) => ({
      id: cred.id,
      type: "public-key",
      transports: cred.transports
    })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
      authenticatorAttachment: "platform"
    }
  });
}

/**
 * Verify a registration response and extract credential data
 */
export async function verifyPasskeyRegistration(
  response: RegistrationResponseJSON,
  expectedChallenge: string
): Promise<VerifiedRegistrationResponse> {
  return await verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: ORIGIN,
    expectedRPID: RP_ID
  });
}

/**
 * Generate authentication options for signing in with a passkey
 */
export async function generatePasskeyAuthenticationOptions(
  options: PasskeyAuthenticationOptions = {}
) {
  return await generateAuthenticationOptions({
    rpID: RP_ID,
    userVerification: "preferred",
    allowCredentials: options.allowCredentials?.map((cred) => ({
      id: cred.id,
      type: "public-key",
      transports: cred.transports
    }))
  });
}

/**
 * Verify an authentication response
 */
export async function verifyPasskeyAuthentication(
  response: AuthenticationResponseJSON,
  expectedChallenge: string,
  credentialPublicKey: Uint8Array,
  credentialCounter: number
): Promise<VerifiedAuthenticationResponse> {
  return await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: ORIGIN,
    expectedRPID: RP_ID,
    credential: {
      id: response.id,
      publicKey: new Uint8Array(credentialPublicKey),
      counter: credentialCounter
    }
  });
}

/**
 * Convert transports array to JSON string for storage
 */
export function serializeTransports(
  transports?: AuthenticatorTransportFuture[]
): string | null {
  return transports ? JSON.stringify(transports) : null;
}

/**
 * Parse transports from JSON string
 */
export function deserializeTransports(
  transports: string | null
): AuthenticatorTransportFuture[] | undefined {
  if (!transports) return undefined;
  try {
    return JSON.parse(transports);
  } catch {
    return undefined;
  }
}
