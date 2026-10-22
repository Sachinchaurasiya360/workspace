import Image from "next/image";

import { signOutAction } from "@/actions/auth";
import { SetPasswordForm } from "./set-password-form";

export default function SetPasswordPage() {
  return (
    <div className="flex min-h-screen flex-col px-4 py-6 sm:px-14 sm:py-10">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Image src="/icon-mark.png" alt="" width={34} height={34} priority />
          <span className="font-serif text-[22px] font-semibold">Nucleo</span>
        </div>
        <form action={signOutAction}>
          <button
            type="submit"
            className="text-sm font-semibold text-secondary-foreground transition-colors hover:text-foreground"
          >
            Sign out
          </button>
        </form>
      </header>

      <main className="flex flex-1 items-center justify-center py-8">
        <div className="flex w-full max-w-[480px] flex-col gap-[26px] rounded-[20px] border border-border bg-card p-6 sm:p-10">
          <div className="flex flex-col gap-2.5">
            <span className="self-start rounded-[10px] bg-primary-soft px-2.5 py-1 text-xs font-semibold text-primary-strong">
              First sign-in
            </span>
            <h1 className="font-serif text-[30px] leading-[1.1] font-medium tracking-[-0.02em] sm:text-[36px]">
              Choose your password
            </h1>
            <p className="text-[15px] leading-normal text-muted-foreground">
              You signed in with a temporary password from your admin. Set your
              own to continue to your workspace.
            </p>
          </div>
          <SetPasswordForm />
        </div>
      </main>
    </div>
  );
}
