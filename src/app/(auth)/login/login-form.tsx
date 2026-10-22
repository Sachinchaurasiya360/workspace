"use client";

import { useActionState, useState } from "react";
import { Loader2 } from "lucide-react";

import { loginAction } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { DemoLogins } from "./demo-logins";

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(loginAction, undefined);
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <form action={formAction} className="flex flex-col gap-[18px] lg:gap-7">
      <div className="flex flex-col gap-[18px]">
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Work email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@nucleohq.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="h-[50px] rounded-xl text-base lg:h-12 lg:rounded-[11px] lg:text-[15px]"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="password">Password</Label>
          <div className="flex h-[50px] items-center rounded-xl border border-input bg-card pr-1.5 pl-3.5 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/20 lg:h-12 lg:rounded-[11px]">
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="Your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground lg:text-[15px]"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              className="h-9 rounded-lg bg-background px-3 text-[13px] font-semibold text-secondary-foreground transition-colors hover:bg-muted"
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
        </div>
        {state?.error && (
          <p className="text-[13px] font-medium text-destructive" role="alert">
            {state.error}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3.5">
        <Button
          type="submit"
          disabled={isPending}
          className="mt-1.5 h-[52px] rounded-xl text-base lg:mt-0 lg:h-[50px] lg:text-[15px]"
        >
          {isPending && <Loader2 className="animate-spin" />}
          Sign in
        </Button>
        <p className="text-center text-[13px] leading-normal text-muted-foreground">
          Forgot your password? Ask your workspace admin to reset it.
        </p>
      </div>

      <DemoLogins
        onPick={(demoEmail, demoPassword) => {
          setEmail(demoEmail);
          setPassword(demoPassword);
        }}
      />
    </form>
  );
}
