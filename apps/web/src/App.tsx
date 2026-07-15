import { useState, useEffect } from "react";
import { Header } from "./components/Header";
import { BottomNav } from "./components/BottomNav";
import { AuthCard } from "./components/AuthCard";
import { Toaster } from "@/components/ui/sonner";
import { CaptureView } from "./views/CaptureView";
import { KnowledgeView } from "./views/KnowledgeView";
import { useAuth } from "./hooks/use-auth";
import * as api from "@/lib/api";
import "./index.css";

interface ProbeData {
  question: string;
  context: string;
  related_entries: string[];
}

type Tab = "capture" | "knowledge";
type Theme = "light" | "dark" | "system";

function getInitialTheme(): Theme {
  return (localStorage.getItem("theme") as Theme) ?? "system";
}

export function App() {
  const [activeTab, setActiveTab] = useState<Tab>("capture");
  const [probeVisible, setProbeVisible] = useState(false);
  const [probeData, setProbeData] = useState<ProbeData | null>(null);
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [processingCount, setProcessingCount] = useState(0);

  const handleProcessingChange = (delta: 1 | -1) =>
    setProcessingCount((n) => Math.max(0, n + delta));
  const { user, loading, authRequired, maxNoteSeconds, signIn, signUp } = useAuth();

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") {
      root.removeAttribute("data-theme");
    } else {
      root.setAttribute("data-theme", theme);
    }
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    if (loading) return;
    if (authRequired && !user) return;
    if (sessionStorage.getItem("probe-shown") === "true") return;
    api.get<ProbeData>("/api/probe")
      .then((data) => {
        setProbeData(data);
        setProbeVisible(true);
        sessionStorage.setItem("probe-shown", "true");
      })
      .catch(() => {});
  }, [loading, authRequired, user]);

  function handleProbeTrigger() {
    api.get<ProbeData>("/api/probe?force=true")
      .then((data) => { setProbeData(data); setProbeVisible(true); })
      .catch(() => {});
  }

  function handleThemeToggle() {
    setTheme(prev => {
      if (prev === "system") {
        const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        return prefersDark ? "light" : "dark";
      }
      return prev === "light" ? "dark" : "light";
    });
  }

  const resolvedTheme: "light" | "dark" =
    theme === "system"
      ? (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark")
      : theme;

  if (loading) {
    return <div className="min-h-dvh bg-[var(--bg)]" />;
  }

  if (authRequired && !user) {
    return <AuthCard onSignIn={signIn} onSignUp={signUp} />;
  }

  return (
    <div className="relative min-h-dvh flex flex-col">
      {processingCount > 0 && (
        <div className="fixed top-0 left-0 right-0 z-50 h-[2px] overflow-hidden" style={{ background: "var(--border-subtle)" }}>
          <div
            className="absolute inset-y-0 w-1/3"
            style={{
              background: "linear-gradient(90deg, transparent, var(--accent), transparent)",
              animation: "shimmer 1.4s ease-in-out infinite",
            }}
          />
        </div>
      )}
      {/* Ambient orbs */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden" aria-hidden="true">
        <div className="ambient-orb orb-primary w-[600px] h-[600px] -top-[180px] -right-[120px] absolute" style={{ animationDelay: "-5s" }} />
        <div className="ambient-orb orb-secondary w-[450px] h-[450px] -bottom-[100px] -left-[80px] absolute" style={{ animationDelay: "-10s", animationDuration: "25s" }} />
      </div>

      <div className="relative z-[1] flex flex-col min-h-dvh">
        <Header
          username={user?.email?.split("@")[0] ?? "local"}
          theme={resolvedTheme}
          activeTab={activeTab}
          onThemeToggle={handleThemeToggle}
          onTabChange={setActiveTab}
        />

        {/* Vertically centered capture, natural flow for knowledge */}
        <main
          className={`flex-1 w-full mx-auto px-6 transition-[max-width] duration-300 ${
            activeTab === "capture"
              ? `${probeVisible ? "max-w-[720px]" : "max-w-[560px]"} flex flex-col justify-center py-8 pb-16 md:pb-8`
              : "max-w-[640px] pt-8 pb-16 md:pb-8"
          }`}
        >
          {activeTab === "capture" && (
            <CaptureView
              probeVisible={probeVisible}
              probeData={probeData}
              onProbeTrigger={handleProbeTrigger}
              onProbeDismiss={() => setProbeVisible(false)}
              maxNoteSeconds={maxNoteSeconds}
              onProcessingChange={handleProcessingChange}
            />
          )}
          {activeTab === "knowledge" && <KnowledgeView />}
        </main>

        {/* Mobile-only bottom nav */}
        <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
      </div>

      <Toaster position="bottom-center" />
    </div>
  );
}
