import Image from "next/image";

import { LoginForm } from "./login-form";

const FEATURES = [
  "Tasks & projects",
  "KPIs & daily updates",
  "Events & approvals",
  "Leads",
];

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* Brand panel: full-height column on desktop, collapsed header on mobile */}
      <section className="flex h-[300px] shrink-0 flex-col justify-between rounded-b-[28px] bg-foreground px-6 pt-14 pb-7 text-background lg:h-auto lg:min-h-screen lg:w-[680px] lg:rounded-none lg:px-16 lg:py-12">
        <Image
          src="/logo.png"
          alt="Nucleo"
          width={186}
          height={80}
          priority
          className="-mt-[19px] -mb-[21px] -ml-1.5 h-[65px] w-[150px] lg:-mt-[23px] lg:-mb-[27px] lg:-ml-[7px] lg:h-20 lg:w-[186px]"
        />

        <h1 className="font-serif text-[36px] leading-[1.08] font-medium tracking-[-0.02em] lg:text-[60px] lg:leading-[1.04] lg:tracking-[-0.025em]">
          <span className="lg:hidden">Your team&rsquo;s work, in one place.</span>
          <span className="hidden lg:inline">
            Your team&rsquo;s work, targets and events &mdash; in one place.
          </span>
        </h1>

        <ul className="hidden flex-wrap gap-x-7 gap-y-2 text-[13px] text-[#B7B6AE] lg:flex">
          {FEATURES.map((feature) => (
            <li key={feature}>{feature}</li>
          ))}
        </ul>
      </section>

      <section className="flex flex-1 justify-center px-6 pt-8 pb-7 lg:items-center lg:px-12 lg:py-12">
        <div className="flex w-full max-w-[400px] flex-col gap-[18px] lg:gap-7">
          <div className="flex flex-col gap-2">
            <h2 className="text-[22px] font-semibold lg:hidden">Sign in</h2>
            <h2 className="hidden font-serif text-[40px] leading-[1.1] font-medium tracking-[-0.02em] lg:block">
              Welcome back
            </h2>
            <p className="hidden text-[15px] leading-normal text-muted-foreground lg:block">
              Sign in with your work email and password.
            </p>
          </div>

          <LoginForm />

          <p className="border-t border-border pt-5 text-[13px] leading-normal text-muted-foreground">
            New here? Your admin creates your account and shares a temporary
            password. You&rsquo;ll choose your own the first time you sign in.
          </p>
        </div>
      </section>
    </div>
  );
}
