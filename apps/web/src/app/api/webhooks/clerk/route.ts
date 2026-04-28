import { Webhook } from "svix";
import { headers } from "next/headers";
import { db } from "@ams/database";

export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;
  if (!WEBHOOK_SECRET) {
    return new Response("CLERK_WEBHOOK_SECRET not configured", { status: 500 });
  }

  const headerPayload = await headers();
  const svix_id = headerPayload.get("svix-id");
  const svix_timestamp = headerPayload.get("svix-timestamp");
  const svix_signature = headerPayload.get("svix-signature");

  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new Response("Missing Svix headers", { status: 400 });
  }

  // Must read as text — svix verifies the raw body string
  const payload = await req.text();
  const wh = new Webhook(WEBHOOK_SECRET);

  let evt: { type: string; data: Record<string, any> };
  try {
    evt = wh.verify(payload, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    }) as typeof evt;
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  if (evt.type === "user.created" || evt.type === "user.updated") {
    const { id: clerkUserId, email_addresses, first_name, last_name } = evt.data;
    const email: string = email_addresses?.[0]?.email_address ?? "";
    const name = `${first_name ?? ""} ${last_name ?? ""}`.trim() || email;

    await db.user.upsert({
      where: { clerkUserId },
      update: { email, name, lastLoginAt: new Date() },
      create: {
        clerkUserId,
        email,
        name,
        organisationId: process.env.DEFAULT_ORGANISATION_ID ?? "default",
        lastLoginAt: new Date(),
      },
    });
  }

  return new Response("OK", { status: 200 });
}
