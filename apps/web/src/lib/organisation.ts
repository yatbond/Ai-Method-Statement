import { db } from "@ams/database";

export async function ensureDefaultOrganisation(): Promise<string> {
  const organisationId = process.env.DEFAULT_ORGANISATION_ID ?? "default";
  await db.organisation.upsert({
    where: { id: organisationId },
    update: {},
    create: {
      id: organisationId,
      name: process.env.DEFAULT_ORGANISATION_NAME ?? "Default Organisation",
    },
  });
  return organisationId;
}
