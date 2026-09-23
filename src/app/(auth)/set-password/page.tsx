import { SetPasswordForm } from "./set-password-form";

export default function SetPasswordPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Set a new password</h1>
        <p className="text-sm text-muted-foreground">
          You&apos;re using a temporary password. Choose a new one to continue.
        </p>
      </div>
      <SetPasswordForm />
    </div>
  );
}
