import type { AccessLevel } from "@prisma/client";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      isFounder: boolean;
      access: AccessLevel;
      mustChangePassword: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
    isFounder: boolean;
    access: AccessLevel;
    mustChangePassword: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    isFounder: boolean;
    access: AccessLevel;
    mustChangePassword: boolean;
  }
}
