// =============================================================================
// Audit logging (REQ-NFR-SEC-004)
//
// All actions on documents and method statements MUST be written to an
// immutable audit log with user, timestamp, action, and resource identifiers.
// Retention: ≥ 7 years.
// =============================================================================

import { db } from "@ams/database";

export interface AuditEvent {
  userId?: string;
  projectId?: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export async function audit(event: AuditEvent): Promise<void> {
  await db.auditLog.create({
    data: {
      userId: event.userId,
      projectId: event.projectId,
      action: event.action,
      resourceType: event.resourceType,
      resourceId: event.resourceId,
      metadata: event.metadata,
      ipAddress: event.ipAddress,
      userAgent: event.userAgent,
    },
  });
}

// Common audit action constants
export const AUDIT_ACTIONS = {
  // Authentication
  USER_LOGIN: "user.login",
  USER_LOGOUT: "user.logout",

  // Projects
  PROJECT_CREATED: "project.created",
  PROJECT_UPDATED: "project.updated",
  PROJECT_ARCHIVED: "project.archived",
  PROJECT_MEMBER_ADDED: "project.member_added",

  // Documents
  DOCUMENT_UPLOADED: "document.uploaded",
  DOCUMENT_INGESTED: "document.ingested",
  DOCUMENT_DELETED: "document.deleted",

  // Method statements
  MS_CREATED: "method_statement.created",
  MS_UPDATED: "method_statement.updated",
  MS_BRIEF_GENERATED: "method_statement.brief_generated",

  // Sections
  SECTION_DRAFTED: "section.drafted",
  SECTION_REGENERATED: "section.regenerated",
  SECTION_EDITED: "section.edited",

  // Gap items
  GAP_CONFIRMED: "gap_item.confirmed",
  GAP_REJECTED: "gap_item.rejected",
  GAP_NOT_APPLICABLE: "gap_item.not_applicable",

  // Conflicts
  CONFLICT_RESOLVED: "conflict.resolved",
  CONFLICT_UNRESOLVED: "conflict.unresolved",

  // Traceability markers
  MARKER_ADDED: "reference_marker.added",
  MARKER_DELETED: "reference_marker.deleted",
  MARKER_REASSIGNED: "reference_marker.reassigned",

  // Export
  MS_EXPORTED: "method_statement.exported",
} as const;
