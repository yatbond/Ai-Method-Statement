// =============================================================================
// EDMS integration provider skeleton (P11 — v1.1, REQ-EDMS)
//
// Abstracts push/pull of documents to Engineering Document Management Systems
// (SharePoint, Aconex, ProjectWise, etc.).
//
// The provider interface is intentionally minimal — concrete adapters fill in
// the transport details. Wire a provider by setting EDMS_PROVIDER in the env.
// =============================================================================

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EDMSDocument {
  externalId: string;
  title: string;
  revision: string;
  status: "DRAFT" | "ISSUED_FOR_REVIEW" | "APPROVED" | "SUPERSEDED";
  mimeType: string;
  downloadUrl?: string;
  metadata: Record<string, string>;
}

export interface EDMSUploadInput {
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  metadata: {
    title: string;
    projectCode: string;
    discipline: string;
    revision: string;
    status?: string;
  };
}

export interface EDMSProvider {
  readonly name: string;

  /** List documents in a project folder/workspace. */
  listDocuments(projectCode: string, options?: { filter?: string }): Promise<EDMSDocument[]>;

  /** Download raw bytes for a document. */
  downloadDocument(externalId: string): Promise<Buffer>;

  /** Upload a new document revision; returns the new external ID. */
  uploadDocument(input: EDMSUploadInput): Promise<{ externalId: string; url: string }>;

  /** Check connection health — resolves if OK, rejects on failure. */
  healthCheck(): Promise<void>;
}

// ── SharePoint provider stub ──────────────────────────────────────────────────

export class SharePointEDMSProvider implements EDMSProvider {
  readonly name = "sharepoint";

  private readonly siteUrl: string;
  private readonly accessToken: string;

  constructor(config: { siteUrl: string; accessToken: string }) {
    this.siteUrl = config.siteUrl;
    this.accessToken = config.accessToken;
  }

  async listDocuments(
    projectCode: string,
    options: { filter?: string } = {}
  ): Promise<EDMSDocument[]> {
    // Microsoft Graph API: GET /sites/{siteId}/drive/items/{folderId}/children
    // Stub — replace with actual Graph SDK call
    throw new Error(
      `SharePointEDMSProvider.listDocuments not implemented. ` +
      `Configure MS Graph SDK and bind to project library for ${projectCode}.`
    );
  }

  async downloadDocument(externalId: string): Promise<Buffer> {
    throw new Error("SharePointEDMSProvider.downloadDocument not implemented.");
  }

  async uploadDocument(input: EDMSUploadInput): Promise<{ externalId: string; url: string }> {
    throw new Error("SharePointEDMSProvider.uploadDocument not implemented.");
  }

  async healthCheck(): Promise<void> {
    // PUT /sites/{siteId} — just verify token resolves
    throw new Error("SharePointEDMSProvider.healthCheck not implemented.");
  }
}

// ── Aconex provider stub ──────────────────────────────────────────────────────

export class AconexEDMSProvider implements EDMSProvider {
  readonly name = "aconex";

  private readonly instanceUrl: string;
  private readonly apiKey: string;
  private readonly projectId: string;

  constructor(config: { instanceUrl: string; apiKey: string; projectId: string }) {
    this.instanceUrl = config.instanceUrl;
    this.apiKey = config.apiKey;
    this.projectId = config.projectId;
  }

  async listDocuments(
    _projectCode: string,
    _options: { filter?: string } = {}
  ): Promise<EDMSDocument[]> {
    // Aconex REST API: GET /api/projects/{projectId}/documents
    throw new Error("AconexEDMSProvider.listDocuments not implemented.");
  }

  async downloadDocument(_externalId: string): Promise<Buffer> {
    throw new Error("AconexEDMSProvider.downloadDocument not implemented.");
  }

  async uploadDocument(_input: EDMSUploadInput): Promise<{ externalId: string; url: string }> {
    throw new Error("AconexEDMSProvider.uploadDocument not implemented.");
  }

  async healthCheck(): Promise<void> {
    throw new Error("AconexEDMSProvider.healthCheck not implemented.");
  }
}

// ── Provider factory ──────────────────────────────────────────────────────────

export function createEDMSProvider(config?: {
  provider?: "sharepoint" | "aconex";
  [key: string]: any;
}): EDMSProvider | null {
  const provider = config?.provider ?? process.env.EDMS_PROVIDER;

  if (!provider) return null;

  switch (provider) {
    case "sharepoint":
      return new SharePointEDMSProvider({
        siteUrl: config?.siteUrl ?? process.env.EDMS_SHAREPOINT_SITE_URL ?? "",
        accessToken: config?.accessToken ?? process.env.EDMS_SHAREPOINT_TOKEN ?? "",
      });
    case "aconex":
      return new AconexEDMSProvider({
        instanceUrl: config?.instanceUrl ?? process.env.EDMS_ACONEX_URL ?? "",
        apiKey: config?.apiKey ?? process.env.EDMS_ACONEX_API_KEY ?? "",
        projectId: config?.projectId ?? process.env.EDMS_ACONEX_PROJECT_ID ?? "",
      });
    default:
      throw new Error(`Unknown EDMS provider: ${provider}`);
  }
}
