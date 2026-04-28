import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { getAuthUser } from "@/lib/auth";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/login");

  const user = await getAuthUser();
  if (!user) {
    // Clerk authenticated but no DB record — webhook may not have fired yet.
    // Trigger manual sync so the user isn't stuck in a redirect loop.
    const { db } = await import("@ams/database");
    const clerkUser = await (await import("@clerk/nextjs/server")).currentUser();
    if (clerkUser) {
      const email = clerkUser.emailAddresses?.[0]?.emailAddress ?? "";
      const name = `${clerkUser.firstName ?? ""} ${clerkUser.lastName ?? ""}`.trim();
      const orgId = process.env.DEFAULT_ORGANISATION_ID ?? "default";
      const upserted = await db.user.upsert({
        where: { clerkUserId: userId },
        create: {
          clerkUserId: userId,
          email,
          name: name || email,
          organisationId: orgId,
        },
        update: { email, name, lastLoginAt: new Date() },
      });
      const freshUser = { id: upserted.id, organisationId: upserted.organisationId, email: upserted.email, name: upserted.name };
      return (
        <div className="flex h-screen bg-gray-50">
          <Sidebar />
          <div className="flex-1 flex flex-col min-w-0">
            <Header user={freshUser} />
            <main className="flex-1 overflow-y-auto p-6">{children}</main>
          </div>
        </div>
      );
    }
    redirect("/login");
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header user={user} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
