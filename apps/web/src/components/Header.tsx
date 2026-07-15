import { Sun, Moon } from "@icon-park/react";
import { Button } from "@/components/ui/button";

type Tab = "capture" | "knowledge";

interface HeaderProps {
  username: string;
  theme: "light" | "dark";
  activeTab: Tab;
  onThemeToggle: () => void;
  onTabChange: (tab: Tab) => void;
}

export function Header({ username, theme, activeTab, onThemeToggle, onTabChange }: HeaderProps) {
  const initial = username.charAt(0).toUpperCase();

  return (
    <header className="sticky top-0 z-10 flex items-center justify-between px-6 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg)]/80 backdrop-blur-xl">
      <h1
        className="font-[var(--font-display)] text-[1.375rem] font-normal tracking-[-0.01em] text-[var(--ink)] select-none"
        style={{ fontStyle: "italic" }}
      >
        resumeKB
      </h1>

      {/* Desktop segmented nav — hidden on mobile (BottomNav takes over) */}
      <nav className="hidden md:flex items-center gap-1 bg-[var(--surface)] rounded-[var(--radius-sm)] p-1" aria-label="Main navigation">
        {(["capture", "knowledge"] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => onTabChange(tab)}
            className={`px-4 py-1.5 rounded-md text-[0.8125rem] font-medium transition-all duration-200 capitalize ${
              activeTab === tab
                ? "bg-[var(--surface-raised)] text-[var(--ink)] shadow-sm"
                : "text-[var(--ink-dim)] hover:text-[var(--ink-muted)]"
            }`}
          >
            {tab}
          </button>
        ))}
      </nav>

      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="w-8 h-8 rounded-full text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors"
          onClick={onThemeToggle}
          aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
        >
          {theme === "light"
            ? <Moon theme="outline" size={15} strokeWidth={3} />
            : <Sun theme="outline" size={15} strokeWidth={3} />}
        </Button>

        {/* Avatar/user chip */}
        <div
          className="flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-full bg-[var(--surface)] border border-[var(--border-subtle)] cursor-default select-none"
          title={username}
        >
          <span className="w-5 h-5 rounded-full bg-[var(--accent-soft)] text-[var(--accent)] text-[0.6875rem] font-semibold flex items-center justify-center leading-none">
            {initial}
          </span>
          <span className="text-[0.75rem] text-[var(--ink-muted)] max-w-[96px] truncate hidden sm:block">
            {username}
          </span>
        </div>
      </div>
    </header>
  );
}
