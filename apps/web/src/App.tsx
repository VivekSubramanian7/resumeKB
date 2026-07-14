import { useState, useEffect } from "react";
import { Header } from "./components/Header";
import { BottomNav } from "./components/BottomNav";
import { AuthCard } from "./components/AuthCard";
import { Toaster } from "@/components/ui/sonner";
import { CaptureView } from "./views/CaptureView";
import { KnowledgeView } from "./views/KnowledgeView";
import { useAuth } from "./hooks/use-auth";
import "./index.css";

type Tab = "capture" | "knowledge";
type Theme = "light" | "dark" | "system";

function getInitialTheme(): Theme {
  return (localStorage.getItem("theme") as Theme) ?? "system";
}

export function App() {
  const [activeTab, setActiveTab] = useState<Tab>("capture");
  const [probeVisible, setProbeVisible] = useState(true);
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
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
      {/* Ambient orbs */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden" aria-hidden="true">
        <div className="ambient-orb orb-primary w-[500px] h-[500px] -top-[150px] -right-[100px] absolute" style={{ animationDelay: "-5s" }} />
        <div className="ambient-orb orb-secondary w-[350px] h-[350px] -bottom-[80px] -left-[50px] absolute" style={{ animationDelay: "-10s", animationDuration: "25s" }} />
      </div>

      <div className="relative z-[1] flex flex-col min-h-dvh">
        <Header
          username={user?.email?.split("@")[0] ?? "local"}
          theme={resolvedTheme}
          onThemeToggle={handleThemeToggle}
        />

        <main
          className={`flex-1 w-full mx-auto px-6 pb-28 ${activeTab === "capture" ? "max-w-[560px] pt-8" : "max-w-[640px] pt-8"}`}
        >
          {activeTab === "capture" && (
            <CaptureView
              probeVisible={probeVisible}
              onProbeTrigger={() => setProbeVisible(true)}
              onProbeDismiss={() => setProbeVisible(false)}
              maxNoteSeconds={maxNoteSeconds}
            />
          )}
          {activeTab === "knowledge" && <KnowledgeView />}
        </main>

        <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
      </div>

      <Toaster position="bottom-center" />
    </div>
  );
}
