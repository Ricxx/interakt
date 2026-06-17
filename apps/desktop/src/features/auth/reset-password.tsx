import { useState } from "react";
import { useResetPassword } from "../../lib/auth";
import { Button } from "../../ui/button";
import { Card } from "../../ui/card";
import { Input } from "../../ui/input";

export function ResetPasswordPage() {
  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  const reset = useResetPassword();
  const [password, setPassword] = useState("");

  return (
    <div className="flex h-screen items-center justify-center bg-bg">
      <Card className="w-full max-w-sm">
        {reset.isSuccess ? (
          <>
            <h1 className="mb-1 text-lg font-semibold">Password updated</h1>
            <p className="text-sm text-muted">You can now sign in with your new password.</p>
            <Button className="mt-4 w-full" onClick={() => (window.location.href = "/")}>
              Go to sign in
            </Button>
          </>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              reset.mutate({ token, password });
            }}
            className="space-y-3"
          >
            <h1 className="text-lg font-semibold">Set a new password</h1>
            <Input
              type="password"
              placeholder="New password (min 8)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
            {reset.isError && <p className="text-sm text-red-600">This link is invalid or expired. Request a new one.</p>}
            <Button type="submit" className="w-full" disabled={reset.isPending || !token}>
              {reset.isPending ? "Saving…" : "Update password"}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
