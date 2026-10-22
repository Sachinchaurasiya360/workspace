import type { AccessLevel } from "@prisma/client";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      isFounder: boolean;
      access: AccessLevel;
      mustChangePassword: boolean;
      sessionVersion: number;
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
    isFounder: boolean;
    access: AccessLevel;
    mustChangePassword: boolean;
    sessionVersion?: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    isFounder: boolean;
    access: AccessLevel;
    mustChangePassword: boolean;
    sessionVersion?: number;
  }
}
