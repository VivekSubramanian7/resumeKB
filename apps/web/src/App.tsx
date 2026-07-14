import { useState } from "react";
import { Header } from "./components/Header";
import { BottomNav } from "./components/BottomNav";
import { Toaster } from "@/components/ui/sonner";
import { CaptureView } from "./views/CaptureView";
import { KnowledgeView } from "./views/KnowledgeView";
import { useAuth } from "./hooks/use-auth";
import "./index.css";

type Tab = "capture" | "knowledge";

export function App() {
  const [activeTab, setActiveTab] = useState<Tab>("capture");
  const [probeVisible, setProbeVisible] = useState(false);
  const { maxNoteSeconds } = useAuth();

  return (
    <div className="relative min-h-dvh flex flex-col">
      {/* Ambient orbs */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden" aria-hidden="true">
        <div
          className="ambient-orb w-[500px] h-[500px] bg-[oklch(0.35_0.12_290)] -top-[150px] -right-[100px] absolute"
          style={{ animationDelay: "-5s" }}
        />
        <div
          className="ambient-orb w-[350px] h-[350px] bg-[oklch(0.3_0.08_55)] -bottom-[80px] -left-[50px] absolute"
          style={{ animationDelay: "-10s", animationDuration: "25s" }}
        />
      </div>

      <div className="relative z-[1] flex flex-col min-h-dvh">
        <Header
          username="praful"
          hasProbeQuestion={!probeVisible}
          onProbeTrigger={() => setProbeVisible(true)}
        />

        <main
          className={`flex-1 w-full mx-auto px-6 pb-28 ${activeTab === "capture" ? "max-w-[520px] pt-12" : "max-w-[640px] pt-8"}`}
        >
          {activeTab === "capture" && (
            <CaptureView
              probeVisible={probeVisible}
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
