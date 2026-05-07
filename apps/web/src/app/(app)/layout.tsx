import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { getAuthUser } from "@/lib/auth";
import { ensureDefaultOrganisation } from "@/lib/organisation";
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
      const orgId = await ensureDefaultOrganisation();
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
      return <AppShell user={freshUser}>{children}</AppShell>;
    }
    redirect("/login");
  }

  return <AppShell user={user}>{children}</AppShell>;
}

function AppShell({
  children,
  user,
}: {
  children: React.ReactNode;
  user: { id: string; organisationId: string; email: string; name: string };
}) {
  return (
    <div className="flex h-screen bg-slate-100 text-slate-950">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header user={user} />
        <main className="flex-1 overflow-y-auto p-8">{children}</main>
      </div>
    </div>
  );
}
