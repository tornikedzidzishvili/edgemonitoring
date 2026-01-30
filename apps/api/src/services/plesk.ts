/**
 * Plesk REST API Service
 * 
 * Connects to Plesk Hosting Edition REST API to fetch customers and domains
 * API Documentation: https://docs.plesk.com/en-US/obsidian/api-rpc/about-rest-api.79359/
 * 
 * Authentication: Basic auth or X-API-Key header
 * Base URL: https://<hostname>:8443/api/v2
 */

import { Agent, fetch as undiciFetch } from "undici";
import { decryptString } from "../cryptoBox.js";
import { prisma } from "../db.js";
import { getEnv } from "../env.js";

// Undici agent that allows self-signed certificates (common with Plesk)
const pleskAgent = new Agent({
  connect: {
    rejectUnauthorized: false
  }
});

/**
 * Client entity from /api/v2/clients
 */
export interface PleskCustomer {
  id: number;
  name: string;
  login: string;
  email: string;
  type: "reseller" | "customer" | "admin";
  company?: string;
  status?: number;
  guid?: string;
  created?: string;
  locale?: string;
  description?: string;
  owner_login?: string;
  external_id?: string;
}

/**
 * DomainResponse entity from /api/v2/domains
 * Note: Does NOT include owner info - need to call /domains/{id}/client for that
 */
export interface PleskDomainResponse {
  id: number;
  name: string;
  ascii_name?: string;
  hosting_type: "virtual" | "standard_forwarding" | "frame_forwarding" | "none";
  base_domain_id: number;
  www_root?: string;
  guid?: string;
  created?: string;
  aliases?: Array<{
    id: number;
    name: string;
    ascii_name?: string;
    web?: boolean;
    dns?: boolean;
    mail?: boolean;
    seo_redirect?: boolean;
  }>;
}

/**
 * Extended domain info with owner (fetched separately)
 */
export interface PleskDomain {
  id: number;
  name: string;
  hosting_type: string;
  base_domain_id: number;
  owner?: PleskCustomer | null;
}

export interface PleskSyncResult {
  success: boolean;
  customersCount: number;
  domainsCount: number;
  syncedDomainsCount: number;
  removedDomainsCount?: number;
  error?: string;
  customers: PleskCustomer[];
  domains: PleskDomain[];
}

interface PleskCredentials {
  apiUrl: string;
  apiKey?: string;
  username?: string;
  password?: string;
}

/**
 * Normalize API URL to ensure consistent format
 * - Removes trailing slashes
 * - Adds default port :8443 if no port specified
 * - Ensures https:// protocol
 */
function normalizeApiUrl(url: string): string {
  let normalized = url.trim();
  
  // Add https:// if no protocol
  if (!normalized.startsWith("http://") && !normalized.startsWith("https://")) {
    normalized = `https://${normalized}`;
  }
  
  // Parse URL to check for port
  try {
    const parsed = new URL(normalized);
    // Add default Plesk port if not specified
    if (!parsed.port && parsed.protocol === "https:") {
      normalized = `${parsed.protocol}//${parsed.hostname}:8443${parsed.pathname}`;
    }
  } catch {
    // If URL parsing fails, just continue with what we have
  }
  
  // Remove trailing slashes
  return normalized.replace(/\/+$/, "");
}

/**
 * Make a request to Plesk REST API
 * 
 * Note: Plesk often uses self-signed certificates. In production environments,
 * you may need to configure NODE_TLS_REJECT_UNAUTHORIZED=0 or provide proper certs.
 */
async function pleskRequest<T>(
  credentials: PleskCredentials,
  endpoint: string,
  method: "GET" | "POST" | "PUT" | "DELETE" = "GET",
  body?: unknown
): Promise<T> {
  const baseUrl = normalizeApiUrl(credentials.apiUrl);
  const url = `${baseUrl}/api/v2${endpoint}`;
  
  const headers: Record<string, string> = {
    "Accept": "application/json",
    "Content-Type": "application/json"
  };

  // Plesk supports two auth methods: API key or Basic auth
  // Prefer Basic auth if username/password provided (more common)
  if (credentials.username && credentials.password) {
    const auth = Buffer.from(`${credentials.username}:${credentials.password}`).toString("base64");
    headers["Authorization"] = `Basic ${auth}`;
    console.log(`[Plesk Request] ${method} ${url} - Using Basic auth for user: ${credentials.username}`);
  } else if (credentials.apiKey) {
    headers["X-API-Key"] = credentials.apiKey;
    console.log(`[Plesk Request] ${method} ${url} - Using API key`);
  } else {
    throw new Error("No valid authentication credentials provided");
  }

  const response = await undiciFetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    dispatcher: pleskAgent
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    console.log(`[Plesk Request] FAILED: ${response.status} - ${errorText}`);
    throw new Error(`Plesk API error (${response.status}): ${errorText}`);
  }

  console.log(`[Plesk Request] SUCCESS: ${response.status}`);
  return response.json() as Promise<T>;
}

/**
 * Fetch all customers from Plesk (/api/v2/clients)
 */
export async function fetchPleskCustomers(credentials: PleskCredentials): Promise<PleskCustomer[]> {
  const customers = await pleskRequest<PleskCustomer[]>(credentials, "/clients");
  return customers;
}

/**
 * Fetch domain owner info (/api/v2/domains/{id}/client)
 */
async function fetchDomainOwner(credentials: PleskCredentials, domainId: number): Promise<PleskCustomer | null> {
  try {
    return await pleskRequest<PleskCustomer>(credentials, `/domains/${domainId}/client`);
  } catch {
    // Domain might not have an owner (admin-owned)
    return null;
  }
}

/**
 * Fetch all domains from Plesk with owner information
 * 
 * First fetches domains from /api/v2/domains, then enriches each
 * domain with owner info from /api/v2/domains/{id}/client
 */
export async function fetchPleskDomains(credentials: PleskCredentials): Promise<PleskDomain[]> {
  // Fetch all domains
  const domainResponses = await pleskRequest<PleskDomainResponse[]>(credentials, "/domains");
  
  // Fetch owner info for each domain (in parallel for performance)
  const domainsWithOwners = await Promise.all(
    domainResponses.map(async (domain): Promise<PleskDomain> => {
      const owner = await fetchDomainOwner(credentials, domain.id);
      return {
        id: domain.id,
        name: domain.name,
        hosting_type: domain.hosting_type,
        base_domain_id: domain.base_domain_id,
        owner
      };
    })
  );
  
  return domainsWithOwners;
}

/**
 * Test connection to Plesk server
 * Uses /api/v2/server endpoint which returns server metadata
 */
export async function testPleskConnection(credentials: PleskCredentials): Promise<{ 
  ok: boolean; 
  message: string; 
  serverInfo?: {
    hostname?: string;
    platform?: string;
    panel_version?: string;
  };
}> {
  try {
    // Try to fetch server info to verify connection
    const serverInfo = await pleskRequest<{
      hostname?: string;
      platform?: string;
      panel_version?: string;
      guid?: string;
    }>(credentials, "/server");
    return { 
      ok: true, 
      message: `Connected to ${serverInfo.hostname || "Plesk server"} (v${serverInfo.panel_version || "unknown"})`,
      serverInfo 
    };
  } catch (error) {
    return { 
      ok: false, 
      message: error instanceof Error ? error.message : "Failed to connect to Plesk server"
    };
  }
}

/**
 * Decrypt and retrieve Plesk server credentials
 */
export async function getPleskCredentials(serverId: string): Promise<PleskCredentials | null> {
  const env = getEnv();
  const server = await prisma.sharedHostingServer.findUnique({
    where: { id: serverId }
  });

  if (!server || !server.apiUrl) {
    return null;
  }

  let apiKey: string | undefined;
  let username: string | undefined;
  let password: string | undefined;

  // Decrypt API key if present
  if (server.apiKeyEnc && server.apiKeyIv && server.apiKeyTag) {
    try {
      apiKey = decryptString(
        { enc: server.apiKeyEnc, iv: server.apiKeyIv, tag: server.apiKeyTag },
        env.SSH_KEY_MASTER_SECRET
      );
    } catch {
      // Failed to decrypt
    }
  }

  // Decrypt username/password if present
  if (server.usernameEnc && server.usernameIv && server.usernameTag) {
    try {
      username = decryptString(
        { enc: server.usernameEnc, iv: server.usernameIv, tag: server.usernameTag },
        env.SSH_KEY_MASTER_SECRET
      );
    } catch {
      // Failed to decrypt
    }
  }

  if (server.passwordEnc && server.passwordIv && server.passwordTag) {
    try {
      password = decryptString(
        { enc: server.passwordEnc, iv: server.passwordIv, tag: server.passwordTag },
        env.SSH_KEY_MASTER_SECRET
      );
    } catch {
      // Failed to decrypt
    }
  }

  return {
    apiUrl: server.apiUrl,
    apiKey,
    username,
    password
  };
}

/**
 * Sync domains from Plesk server to local database
 */
export async function syncPleskDomains(
  serverId: string,
  selectedDomainNames?: string[] // If provided, only sync these domains
): Promise<PleskSyncResult> {
  const credentials = await getPleskCredentials(serverId);
  if (!credentials) {
    return {
      success: false,
      customersCount: 0,
      domainsCount: 0,
      syncedDomainsCount: 0,
      error: "Server credentials not found",
      customers: [],
      domains: []
    };
  }

  try {
    // Fetch customers and domains from Plesk
    const [customers, domains] = await Promise.all([
      fetchPleskCustomers(credentials).catch(() => [] as PleskCustomer[]),
      fetchPleskDomains(credentials)
    ]);

    // Create a map of customer ID to customer info
    const customerMap = new Map<number, PleskCustomer>();
    for (const customer of customers) {
      customerMap.set(customer.id, customer);
    }

    // Get the server to check syncAll setting
    const server = await prisma.sharedHostingServer.findUnique({
      where: { id: serverId }
    });

    // Filter domains if not syncing all
    let domainsToSync = domains;
    if (selectedDomainNames && selectedDomainNames.length > 0) {
      domainsToSync = domains.filter(d => selectedDomainNames.includes(d.name));
    } else if (server && !server.syncAll) {
      // If syncAll is false and no specific domains provided, don't sync any new ones
      // Only update existing ones
      const existingAccounts = await prisma.sharedHosting.findMany({
        where: { serverId },
        include: { domains: true }
      });
      const existingDomainNames = new Set(
        existingAccounts.flatMap(a => a.domains.map(d => d.domain))
      );
      domainsToSync = domains.filter(d => existingDomainNames.has(d.name));
    }

    // Group domains by customer/owner
    const domainsByCustomer = new Map<string, { customer: PleskCustomer | null; domains: PleskDomain[] }>();
    
    for (const domain of domainsToSync) {
      const owner = domain.owner;
      const customerId = owner ? String(owner.id) : "admin";
      
      if (!domainsByCustomer.has(customerId)) {
        domainsByCustomer.set(customerId, { customer: owner ?? null, domains: [] });
      }
      domainsByCustomer.get(customerId)!.domains.push(domain);
    }

    let syncedDomainsCount = 0;

    // Create or update SharedHosting accounts and domains
    for (const [pleskCustomerId, { customer, domains: customerDomains }] of domainsByCustomer) {
      // Find or create the SharedHosting account for this customer
      let account = await prisma.sharedHosting.findFirst({
        where: {
          serverId,
          pleskCustomerId
        }
      });

      if (!account) {
        account = await prisma.sharedHosting.create({
          data: {
            name: customer?.name || "Server Admin",
            serverId,
            pleskCustomerId,
            pleskLogin: customer?.login
          }
        });
      } else {
        // Update customer name if changed
        await prisma.sharedHosting.update({
          where: { id: account.id },
          data: {
            name: customer?.name || account.name,
            pleskLogin: customer?.login
          }
        });
      }

      // Sync domains for this account
      for (const domain of customerDomains) {
        const existingDomain = await prisma.sharedHostingDomain.findFirst({
          where: {
            sharedHostingId: account.id,
            domain: domain.name
          }
        });

        if (!existingDomain) {
          await prisma.sharedHostingDomain.create({
            data: {
              sharedHostingId: account.id,
              domain: domain.name,
              customerName: customer?.name,
              customerEmail: customer?.email,
              enabled: true
            }
          });
          syncedDomainsCount++;
        } else {
          // Update customer info
          await prisma.sharedHostingDomain.update({
            where: { id: existingDomain.id },
            data: {
              customerName: customer?.name,
              customerEmail: customer?.email
            }
          });
        }
      }
    }

    // Remove domains that no longer exist in Plesk (only if syncAll is true)
    let removedDomainsCount = 0;
    if (server?.syncAll) {
      const pleskDomainNames = new Set(domains.map(d => d.name));
      const existingAccounts = await prisma.sharedHosting.findMany({
        where: { serverId },
        include: { domains: true }
      });
      
      for (const account of existingAccounts) {
        for (const domain of account.domains) {
          if (!pleskDomainNames.has(domain.domain)) {
            await prisma.sharedHostingDomain.delete({ where: { id: domain.id } });
            removedDomainsCount++;
          }
        }
        
        // Remove empty accounts
        const remainingDomains = await prisma.sharedHostingDomain.count({
          where: { sharedHostingId: account.id }
        });
        if (remainingDomains === 0) {
          await prisma.sharedHosting.delete({ where: { id: account.id } });
        }
      }
    }

    // Update server last sync time
    await prisma.sharedHostingServer.update({
      where: { id: serverId },
      data: {
        lastSyncAt: new Date(),
        lastSyncError: null
      }
    });

    return {
      success: true,
      customersCount: customers.length,
      domainsCount: domains.length,
      syncedDomainsCount,
      removedDomainsCount,
      customers,
      domains
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown sync error";
    
    // Update server with error
    await prisma.sharedHostingServer.update({
      where: { id: serverId },
      data: {
        lastSyncError: errorMessage
      }
    });

    return {
      success: false,
      customersCount: 0,
      domainsCount: 0,
      syncedDomainsCount: 0,
      error: errorMessage,
      customers: [],
      domains: []
    };
  }
}

/**
 * Fetch available domains from Plesk (for domain selection UI)
 */
export async function fetchAvailablePleskDomains(serverId: string): Promise<{
  success: boolean;
  domains: Array<{
    name: string;
    owner: string | null;
    ownerEmail: string | null;
    hostingType: string;
  }>;
  error?: string;
}> {
  const credentials = await getPleskCredentials(serverId);
  if (!credentials) {
    return { success: false, domains: [], error: "Server credentials not found" };
  }

  try {
    const domains = await fetchPleskDomains(credentials);
    
    return {
      success: true,
      domains: domains.map(d => ({
        name: d.name,
        owner: d.owner?.name || null,
        ownerEmail: d.owner?.email || null,
        hostingType: d.hosting_type
      }))
    };
  } catch (error) {
    return {
      success: false,
      domains: [],
      error: error instanceof Error ? error.message : "Failed to fetch domains"
    };
  }
}
