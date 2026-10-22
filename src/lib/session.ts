import { cache } from "react";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * The JWT only proves who the user is. Access level, founder flag, active
 * state and password status are re-read from the database (once per
 * request) so an admin's change — deactivating someone, resetting their
 * password — takes effect immediately. A JWT minted before the user's last
 * password reset/change (older sessionVersion) is treated as signed out.
 */
export const getCurrentUser = cache(async () => {
  const session = await auth();
  if (!session?.user?.id) return null;
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isFounder: true,
      access: true,
      isActive: true,
      mustChangePassword: true,
      sessionVersion: true,
    },
  });
  if (!user || !user.isActive) return null;
  if ((session.user.sessionVersion ?? 0) !== user.sessionVersion) return null;
  return user;
});

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

/** For server actions. Accounts still on a temporary password can do nothing but set a new one. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  if (user.mustChangePassword) throw new Error("Set a new password before continuing.");
  return user;
}
