import { signOut } from "@/lib/auth";

/**
 * Clears a session the app no longer accepts (deactivated account, password
 * reset elsewhere). Redirecting straight to /login would loop: the proxy
 * still sees a signed-in cookie and bounces back to "/".
 */
export async function GET() {
  await signOut({ redirectTo: "/login" });
}
