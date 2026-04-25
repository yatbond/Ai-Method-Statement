// =============================================================================
// NextAuth.js configuration (REQ-NFR-SEC-001)
//
// Authentication MUST use the company's existing SSO (Azure AD or equivalent).
// No hosted email/password auth is permitted.
// =============================================================================

import NextAuth from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { db } from "@ams/database";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    MicrosoftEntraID({
      clientId: process.env.AZURE_AD_CLIENT_ID!,
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
      tenantId: process.env.AZURE_AD_TENANT_ID!,
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (!user.email) return false;

      // Upsert user on every SSO login
      await db.user.upsert({
        where: { email: user.email },
        update: { name: user.name ?? user.email, lastLoginAt: new Date() },
        create: {
          email: user.email,
          name: user.name ?? user.email,
          // Organisation must be provisioned separately by admin
          organisationId: process.env.DEFAULT_ORGANISATION_ID ?? "default",
          lastLoginAt: new Date(),
        },
      });

      return true;
    },

    async session({ session, token }) {
      if (session.user?.email) {
        const dbUser = await db.user.findUnique({
          where: { email: session.user.email },
          select: { id: true, organisationId: true },
        });

        if (dbUser) {
          (session.user as any).id = dbUser.id;
          (session.user as any).organisationId = dbUser.organisationId;
        }
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
});
