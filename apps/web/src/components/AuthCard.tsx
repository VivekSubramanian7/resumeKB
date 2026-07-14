import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface AuthCardProps {
  onSignIn: (email: string, password: string) => Promise<void>;
  onSignUp: (email: string, password: string) => Promise<void>;
}

export function AuthCard({ onSignIn, onSignUp }: AuthCardProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handle = async (action: "signin" | "signup") => {
    setError("");
    setLoading(true);
    try {
      if (action === "signin") await onSignIn(email, password);
      else await onSignUp(email, password);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Auth failed");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-dvh flex items-center justify-center px-6 bg-[var(--bg)]">
      <Card className="w-full max-w-sm border-[var(--border-subtle)] bg-[var(--surface)]">
        <CardHeader>
          <h2 className="font-[var(--font-display)] text-[1.5rem] text-[var(--ink)]">
            Sign in to your knowledge base
          </h2>
          <p className="text-[0.75rem] text-[var(--ink-muted)]">Each account has its own private KB.</p>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="bg-[var(--bg)] border-[var(--border)] text-[var(--ink)]"
          />
          <Input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="bg-[var(--bg)] border-[var(--border)] text-[var(--ink)]"
          />
          {error && <p className="text-[0.75rem] text-red-400">{error}</p>}
          <div className="flex gap-2 mt-2">
            <Button
              onClick={() => handle("signin")}
              disabled={loading}
              className="flex-1 bg-[var(--accent)] text-[var(--bg)]"
            >
              Sign in
            </Button>
            <Button
              variant="outline"
              onClick={() => handle("signup")}
              disabled={loading}
              className="flex-1 border-[var(--border)] text-[var(--ink-muted)]"
            >
              Sign up
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
