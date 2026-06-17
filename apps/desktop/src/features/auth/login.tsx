import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useBootstrapStatus, useForgotPassword, useLogin, useRegister, useRegisterOpen, useRegistrationOpen } from "../../lib/auth";
import { ApiError } from "../../lib/api";
import { Button } from "../../ui/button";
import { Card } from "../../ui/card";
import { Input } from "../../ui/input";
import loginBg from "../../assets/loginBg.jpeg";

// Shared frame: brand top-left, the given card docked bottom-right, on the brand image.
function AuthFrame({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="relative h-screen overflow-hidden bg-white bg-center bg-no-repeat"
      style={{ backgroundImage: `url(${loginBg})`, backgroundSize: "contain" }}
    >
      <div className="absolute left-10 top-10 text-fg">
        <div className="text-3xl font-semibold">CES</div>
        <p className="mt-1 text-sm text-muted">Corporate Engagement Suite</p>
      </div>
      <Card className="absolute bottom-10 right-10 w-full max-w-sm">{children}</Card>
    </div>
  );
}

export function LoginPage() {
  const { data: status, isLoading } = useBootstrapStatus();
  const { data: reg } = useRegistrationOpen();
  const [mode, setMode] = useState<"signin" | "forgot" | "signup">("signin");

  if (isLoading) return <AuthFrame>Loading…</AuthFrame>;
  if (status?.needsSetup) return <AuthFrame><SetupForm /></AuthFrame>;
  return (
    <AuthFrame>
      {mode === "forgot" && <ForgotForm onBack={() => setMode("signin")} />}
      {mode === "signup" && <SignUpForm onBack={() => setMode("signin")} />}
      {mode === "signin" && (
        <SignInForm
          onForgot={() => setMode("forgot")}
          onSignUp={reg?.open ? () => setMode("signup") : undefined}
        />
      )}
    </AuthFrame>
  );
}

function SignInForm({ onForgot, onSignUp }: { onForgot: () => void; onSignUp?: () => void }) {
  const login = useLogin();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const pending = login.error instanceof ApiError && login.error.message === "pending_approval";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        login.mutate({ email, password });
      }}
      className="space-y-3"
    >
      <h1 className="text-lg font-semibold">Sign in</h1>
      <p className="-mt-1 text-sm text-muted">Welcome back.</p>
      <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
      <Input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
      {login.isError && (
        <p className="text-sm text-red-600">
          {pending ? "Your account is awaiting approval by an administrator." : "Invalid email or password."}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={login.isPending}>
        {login.isPending ? "Signing in…" : "Sign in"}
      </Button>
      <div className="flex justify-between">
        <button type="button" onClick={onForgot} className="text-sm text-primary hover:underline">
          Forgot password?
        </button>
        {onSignUp && (
          <button type="button" onClick={onSignUp} className="text-sm text-primary hover:underline">
            Create an account
          </button>
        )}
      </div>
    </form>
  );
}

// Open self-registration (only shown when the tenant allows it). The account lands
// PENDING — an administrator must approve it before sign-in works.
function SignUpForm({ onBack }: { onBack: () => void }) {
  const register = useRegisterOpen();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  if (register.isSuccess) {
    return (
      <div className="space-y-3">
        <h1 className="text-lg font-semibold">Request received</h1>
        <p className="text-sm text-muted">Your account is awaiting approval by an administrator. You'll be able to sign in once it's approved.</p>
        <button type="button" onClick={onBack} className="text-sm text-primary hover:underline">
          Back to sign in
        </button>
      </div>
    );
  }

  const taken = register.error instanceof ApiError && register.error.message === "email_taken";
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        register.mutate({ displayName, email, password });
      }}
      className="space-y-3"
    >
      <h1 className="text-lg font-semibold">Create an account</h1>
      <p className="-mt-1 text-sm text-muted">An administrator will approve your access.</p>
      <Input placeholder="Your name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoFocus />
      <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <Input type="password" placeholder="Password (min 8 characters)" value={password} onChange={(e) => setPassword(e.target.value)} />
      {register.isError && <p className="text-sm text-red-600">{taken ? "That email is already registered." : "Could not create the account."}</p>}
      <Button type="submit" className="w-full" disabled={register.isPending}>
        {register.isPending ? "Submitting…" : "Request access"}
      </Button>
      <button type="button" onClick={onBack} className="text-sm text-primary hover:underline">
        Back to sign in
      </button>
    </form>
  );
}

function ForgotForm({ onBack }: { onBack: () => void }) {
  const forgot = useForgotPassword();
  const [email, setEmail] = useState("");

  if (forgot.isSuccess) {
    return (
      <div className="space-y-3">
        <h1 className="text-lg font-semibold">Check your email</h1>
        <p className="text-sm text-muted">If an account exists for {email}, a reset link is on its way.</p>
        <button type="button" onClick={onBack} className="text-sm text-primary hover:underline">
          Back to sign in
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        forgot.mutate({ email });
      }}
      className="space-y-3"
    >
      <h1 className="text-lg font-semibold">Reset password</h1>
      <p className="-mt-1 text-sm text-muted">We'll email you a reset link.</p>
      <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
      <Button type="submit" className="w-full" disabled={forgot.isPending}>
        {forgot.isPending ? "Sending…" : "Send reset link"}
      </Button>
      <button type="button" onClick={onBack} className="text-sm text-primary hover:underline">
        Back to sign in
      </button>
    </form>
  );
}

function SetupForm() {
  const register = useRegister();
  const qc = useQueryClient();
  const [companyName, setCompanyName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        register.mutate(
          { companyName, displayName, email, password },
          // If setup is actually closed (an admin already exists), refresh so the
          // screen flips to Sign in instead of leaving a dead-end error.
          { onError: () => qc.invalidateQueries({ queryKey: ["bootstrap-status"] }) },
        );
      }}
      className="space-y-3"
    >
      <h1 className="text-lg font-semibold">Create your admin account</h1>
      <p className="-mt-1 text-sm text-muted">First-time setup for this server.</p>
      <Input placeholder="Company name" value={companyName} onChange={(e) => setCompanyName(e.target.value)} autoFocus />
      <Input placeholder="Your name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
      <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <Input type="password" placeholder="Password (min 8 characters)" value={password} onChange={(e) => setPassword(e.target.value)} />
      {register.isError && <p className="text-sm text-red-600">Could not create the account. Check your details.</p>}
      <Button type="submit" className="w-full" disabled={register.isPending}>
        {register.isPending ? "Creating…" : "Create admin & continue"}
      </Button>
    </form>
  );
}
