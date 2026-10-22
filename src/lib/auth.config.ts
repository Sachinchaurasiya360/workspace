import type { AccessLevel } from "@prisma/client";
import type { NextAuthConfig } from "next-auth";

// Edge-safe base config — used directly by middleware (which runs on the
// Edge runtime and cannot bundle Prisma/pg) and extended with the
// db-touching Credentials provider in lib/auth.ts for everywhere else.
export const authConfig = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [],
  callbacks: {
    jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id as string;
        token.isFounder = user.isFounder as boolean;
        token.access = user.access as AccessLevel;
        token.mustChangePassword = user.mustChangePassword as boolean;
        token.sessionVersion = (user.sessionVersion as number | undefined) ?? 0;
      }
      // Lets server actions push a fresh claim into the JWT (e.g. after
      // setPasswordAction clears mustChangePassword) via unstable_update() —
      // JWT sessions otherwise never re-read the database after login.
      if (trigger === "update" && session) {
        Object.assign(token, session);
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.id as string;
      session.user.isFounder = token.isFounder as boolean;
      session.user.access = token.access as AccessLevel;
      session.user.mustChangePassword = token.mustChangePassword as boolean;
      session.user.sessionVersion = (token.sessionVersion as number | undefined) ?? 0;
      return session;
    },
  },
} satisfies NextAuthConfig;
