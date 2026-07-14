import { Sun, Moon } from "@icon-park/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface HeaderProps {
  username: string;
  theme: "light" | "dark";
  onThemeToggle: () => void;
}

export function Header({ username, theme, onThemeToggle }: HeaderProps) {
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-[var(--border-subtle)] bg-[var(--bg)]/80 backdrop-blur-xl">
      <h1 className="font-[var(--font-display)] text-[1.25rem] font-normal tracking-tight">
        resumeKB
      </h1>
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="w-9 h-9 rounded-full border border-[var(--border)] bg-[var(--surface-raised)] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:border-[var(--border)] transition-colors"
          onClick={onThemeToggle}
          aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
        >
          {theme === "light"
            ? <Moon theme="outline" size={16} strokeWidth={3} />
            : <Sun theme="outline" size={16} strokeWidth={3} />}
        </Button>
        <Badge variant="outline" className="text-xs text-[var(--ink-muted)] border-[var(--border)] rounded-full px-3 py-1">
          {username}
        </Badge>
      </div>
    </header>
  );
}
