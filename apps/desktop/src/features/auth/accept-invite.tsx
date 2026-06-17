import { useState } from "react";
import { useAcceptInvite, useInviteInfo } from "../../lib/auth";
import { Button } from "../../ui/button";
import { Card } from "../../ui/card";
import { Input } from "../../ui/input";

export function AcceptInvitePage() {
  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  const { data: invite, isLoading } = useInviteInfo(token);
  const accept = useAcceptInvite();
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");

  function done() {
    // Logged in now — drop the token from the URL and let the app gate take over.
    window.location.href = "/";
  }

  return (
    <div className="flex h-screen items-center justify-center bg-bg">
      <Card className="w-full max-w-sm">
        {isLoading ? (
          <p className="text-sm text-muted">Checking your invite…</p>
        ) : !invite ? (
          <>
            <h1 className="mb-1 text-lg font-semibold">Invite not valid</h1>
            <p className="text-sm text-muted">This invite link is invalid, used, or expired. Ask an admin to resend it.</p>
          </>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              accept.mutate({ token, displayName, password }, { onSuccess: done });
            }}
            className="space-y-3"
          >
            <h1 className="text-lg font-semibold">Join CES</h1>
            <p className="-mt-1 text-sm text-muted">Setting up the account for {invite.email}.</p>
            <Input placeholder="Your name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoFocus />
            <Input type="password" placeholder="Choose a password (min 8)" value={password} onChange={(e) => setPassword(e.target.value)} />
            {accept.isError && <p className="text-sm text-red-600">Could not complete sign-up. Check your details.</p>}
            <Button type="submit" className="w-full" disabled={accept.isPending}>
              {accept.isPending ? "Joining…" : "Join"}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
