import { toast } from "sonner";

type Result = { ok: true } | { ok: false; error: string };

/** Shows a success or error toast for a server-action result; returns whether it succeeded. */
export function toastResult(result: Result, success: string): result is { ok: true } {
  if (result.ok) {
    toast.success(success);
    return true;
  }
  toast.error(result.error);
  return false;
}
