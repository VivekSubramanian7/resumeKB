import { Icon } from "./Icon";

type Tab = "capture" | "knowledge";

interface BottomNavProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

export function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  return (
    <nav className="fixed bottom-0 inset-x-0 z-10 flex justify-center gap-8 px-6 py-3 border-t border-[var(--border-subtle)] bg-[var(--bg)]/90 backdrop-blur-xl">
      <button
        onClick={() => onTabChange("capture")}
        className={`flex flex-col items-center gap-1 px-5 py-1.5 rounded-lg text-xs transition-colors ${
          activeTab === "capture" ? "text-[var(--accent)]" : "text-[var(--ink-dim)]"
        }`}
      >
        <Icon name="Voice" size={20} className={activeTab === "capture" ? "!text-[var(--accent)]" : ""} />
        Capture
      </button>
      <button
        onClick={() => onTabChange("knowledge")}
        className={`flex flex-col items-center gap-1 px-5 py-1.5 rounded-lg text-xs transition-colors ${
          activeTab === "knowledge" ? "text-[var(--accent)]" : "text-[var(--ink-dim)]"
        }`}
      >
        <Icon name="BookOpen" size={20} className={activeTab === "knowledge" ? "!text-[var(--accent)]" : ""} />
        Knowledge
      </button>
    </nav>
  );
}
