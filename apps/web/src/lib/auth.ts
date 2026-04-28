import { auth } from "@clerk/nextjs/server";
import { db } from "@ams/database";

export type AuthUser = {
  id: string;
  organisationId: string;
  email: string;
  name: string;
};

export async function getAuthUser(): Promise<AuthUser | null> {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return null;

  const user = await db.user.findUnique({
    where: { clerkUserId },
    select: { id: true, organisationId: true, email: true, name: true },
  });

  return user;
}
