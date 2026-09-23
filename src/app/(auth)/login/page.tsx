import Image from "next/image";

import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="mb-1 flex items-center gap-2">
          <Image src="/icon-mark.png" alt="" width={28} height={28} priority />
          <span className="text-lg font-semibold tracking-tight">Nucleo</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="text-sm text-muted-foreground">
          Enter your work email and password to continue.
        </p>
      </div>
      <LoginForm />
    </div>
  );
}
