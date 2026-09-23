"use server";

import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { z } from "zod";

import { auth, signIn, signOut, unstable_update } from "@/lib/auth";
import { db } from "@/lib/db";

export async function signOutAction() {
  await signOut({ redirectTo: "/login" });
}

export type LoginState = { error?: string } | undefined;

export async function loginAction(
  _prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Invalid email or password." };
    }
    throw error;
  }
}

const setPasswordSchema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters."),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match.",
    path: ["confirmPassword"],
  });

export type SetPasswordState = { error?: string } | undefined;

export async function setPasswordAction(
  _prevState: SetPasswordState,
  formData: FormData
): Promise<SetPasswordState> {
  const session = await auth();
  if (!session?.user) {
    return { error: "You must be signed in." };
  }

  const parsed = setPasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  await db.user.update({
    where: { id: session.user.id },
    data: { passwordHash, mustChangePassword: false },
  });
  // Flat shape to match how auth.config.ts's jwt callback merges `session`
  // straight into the token on trigger === "update" (see comment there).
  await unstable_update({ mustChangePassword: false } as never);

  redirect("/");
}
