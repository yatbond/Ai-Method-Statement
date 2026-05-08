// =============================================================================
// Shared constants for AI Method Statement Studio
// =============================================================================

// ── Embedding ─────────────────────────────────────────────────────────────────

// REQ-RAG-002: Gemini Embedding 2 is required. Text-only models are prohibited.
export const REQUIRED_EMBEDDING_MODEL = "gemini-embedding-2";
export const EMBEDDING_DIMENSIONS = 3072; // Gemini Embedding 2 full-width output size

// ── Retrieval ─────────────────────────────────────────────────────────────────

export const DEFAULT_RETRIEVAL_LIMIT = 5;
export const RETRIEVAL_RECALL_THRESHOLD = 0.85; // REQ-NFR-QUAL-002
export const RETRIEVAL_DIAGRAM_RECALL_THRESHOLD = 0.80;

// ── Conflict Detection ────────────────────────────────────────────────────────

export const CONFLICT_RECALL_THRESHOLD = 0.80; // REQ-NFR-QUAL-001
export const CONFLICT_PRECISION_THRESHOLD = 0.70;
export const CONFLICT_FALSE_POSITIVE_LIMIT = 0.15;

// ── Quality Targets ───────────────────────────────────────────────────────────

export const HALLUCINATION_RATE_LIMIT = 0.01; // REQ-NFR-QUAL-003: ≤ 1%
export const REVIEWER_QUALITY_THRESHOLD = 4.0; // REQ-NFR-QUAL-004: ≥ 4.0/5.0
export const OCR_CONFIDENCE_THRESHOLD = 0.90; // REQ-ING-003: default 90%

// ── Performance (SLA) ─────────────────────────────────────────────────────────

export const RETRIEVAL_P95_MS = 3_000; // REQ-NFR-PERF-001
export const INGESTION_TEXT_PDF_P95_MS = 90_000; // REQ-NFR-PERF-002
export const INGESTION_SCANNED_PDF_P95_MS = 300_000; // REQ-NFR-PERF-002
export const DRAFT_SECTION_P95_MS = 30_000; // REQ-NFR-PERF-003
export const WORD_EXPORT_P95_MS = 20_000; // REQ-NFR-PERF-004

// ── Scale ─────────────────────────────────────────────────────────────────────

export const MAX_HISTORICAL_MS_COUNT = 100_000;
export const MAX_UPLOAD_SIZE_BYTES = 200 * 1024 * 1024; // REQ-NFR-SCALE-003
export const MAX_MS_PAGES = 200; // REQ-NFR-SCALE-004

// ── Specificity ───────────────────────────────────────────────────────────────

// REQ-SPEC-001: Phrases that trigger specificity warnings
export const GENERIC_PHRASES = [
  "as required",
  "where necessary",
  "suitable equipment",
  "appropriate PPE",
  "proper supervision",
  "relevant standards shall be followed",
  "inspection shall be carried out",
  "adequate supervision",
  "competent person",
  "where applicable",
  "as appropriate",
  "in accordance with applicable",
  "suitable access",
  "safe access shall be provided",
  "appropriate measures",
  "sufficient",
  "adequate",
];

// ── Traceability ──────────────────────────────────────────────────────────────

export const APPENDIX_PASSAGE_MAX_WORDS = 200; // REQ-TRS-APPA-002

// ── Data Retention ────────────────────────────────────────────────────────────

export const AUDIT_RETENTION_YEARS = 7; // REQ-NFR-SEC-004
export const PROJECT_RETENTION_YEARS = 10; // REQ-NFR-GOV-001
export const DELETION_CASCADE_DAYS = 30; // REQ-NFR-GOV-003

// ── Trade list (REQ-3.1) ──────────────────────────────────────────────────────

export const SUPPORTED_TRADES = [
  "Excavation and Lateral Support",
  "Piling",
  "Earthworks",
  "Concrete Works",
  "Formwork and Rebar",
  "Structural Steel",
  "Precast",
  "Façade",
  "Waterproofing",
  "Drainage",
  "Utilities Diversion",
  "Roadworks",
  "Temporary Works",
  "Lifting Operations",
  "Demolition",
  "Building Services and MEP",
  "Testing and Commissioning",
  "Fit-Out",
  "Railway",
  "Marine",
  "Traffic Management",
  "Environmental Mitigation",
] as const;

export type SupportedTrade = (typeof SUPPORTED_TRADES)[number];

// ── Roles ─────────────────────────────────────────────────────────────────────

export const USER_ROLES = [
  "ADMIN",
  "MANAGER",
  "ENGINEER",
  "PLANNER",
  "SAFETY",
  "COORDINATOR",
  "VIEWER",
] as const;

export type UserRole = (typeof USER_ROLES)[number];

// ── Standard section structure (REQ-DRAFT-003) ────────────────────────────────

export const STANDARD_SECTIONS = [
  { key: "cover", title: "Cover Sheet", order: 0 },
  { key: "document_control", title: "Document Control", order: 1 },
  { key: "purpose", title: "Purpose", order: 2 },
  { key: "scope", title: "Scope", order: 3 },
  { key: "references", title: "References", order: 4 },
  { key: "definitions", title: "Definitions and Abbreviations", order: 5 },
  { key: "roles", title: "Roles and Responsibilities", order: 6 },
  { key: "location", title: "Location and Site Constraints", order: 7 },
  { key: "plant", title: "Plant and Equipment", order: 8 },
  { key: "materials", title: "Materials", order: 9 },
  { key: "labour", title: "Labour", order: 10 },
  { key: "permits", title: "Permits and Notifications", order: 11 },
  { key: "pre_commencement", title: "Pre-Commencement Checks", order: 12 },
  { key: "sequence", title: "Work Sequence", order: 13 },
  { key: "temporary_works", title: "Temporary Works", order: 14 },
  { key: "safety", title: "Safety Controls and Hazard Management", order: 15 },
  { key: "environmental", title: "Environmental Controls", order: 16 },
  { key: "qa_qc", title: "Quality Assurance and Control", order: 17 },
  { key: "hold_points", title: "Hold and Witness Points", order: 18 },
  { key: "interfaces", title: "Interfaces and Dependencies", order: 19 },
  { key: "emergency", title: "Emergency Procedures", order: 20 },
  { key: "housekeeping", title: "Housekeeping", order: 21 },
  { key: "records", title: "Records and Documentation", order: 22 },
  { key: "appendices", title: "Appendices", order: 23 },
] as const;
