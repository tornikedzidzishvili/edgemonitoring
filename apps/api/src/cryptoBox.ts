import crypto from "node:crypto";

export type EncryptedBox = {
  enc: string;
  iv: string;
  tag: string;
};

function deriveKey(masterSecret: string): Buffer {
  // 32 bytes for AES-256.
  return crypto.createHash("sha256").update(masterSecret, "utf8").digest();
}

export function encryptString(plainText: string, masterSecret: string): EncryptedBox {
  const key = deriveKey(masterSecret);
  const iv = crypto.randomBytes(12); // recommended size for GCM

  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encBuf = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    enc: encBuf.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64")
  };
}

export function decryptString(box: EncryptedBox, masterSecret: string): string {
  const key = deriveKey(masterSecret);
  const iv = Buffer.from(box.iv, "base64");
  const tag = Buffer.from(box.tag, "base64");
  const data = Buffer.from(box.enc, "base64");

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(data), decipher.final()]);
  return plain.toString("utf8");
}
