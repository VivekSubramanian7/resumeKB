import { useCallback, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Icon } from "@/components/Icon";
import * as api from "@/lib/api";

interface KBEntry {
  slug: string;
  title: string;
  entry_type: string;
  tags: string[];
}

const ENTRY_TYPES = ["all", "skill", "project", "experience", "person", "organization"];

export function KnowledgeView() {
  const [entries, setEntries] = useState<KBEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const type = filter === "all" ? undefined : filter;
      const path = type ? `/api/kb/entries?type=${type}` : "/api/kb/entries";
      const data = await api.get<KBEntry[]>(path);
      setEntries(data);
    } catch {
      setEntries([]);
    }
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const handleSearch = useCallback(
    async (q: string) => {
      setSearch(q);
      if (!q.trim()) {
        fetchEntries();
        return;
      }
      setLoading(true);
      try {
        const results = await api.get<Array<{ slug: string; title: string; snippet: string }>>(
          `/api/kb/search?q=${encodeURIComponent(q)}`
        );
        setEntries(
          results.map((r) => ({ slug: r.slug, title: r.title, entry_type: "", tags: [] }))
        );
      } catch {
        setEntries([]);
      }
      setLoading(false);
    },
    [fetchEntries]
  );

  return (
    <div className="flex flex-col gap-6 max-w-[640px] w-full mx-auto">
      <div className="flex items-baseline justify-between">
        <h2 className="font-[var(--font-display)] text-[1.5rem] font-normal">Knowledge base</h2>
        <span className="text-[0.75rem] text-[var(--ink-dim)]">{entries.length} entries</span>
      </div>

      <Input
        type="search"
        placeholder="Search entries..."
        value={search}
        onChange={(e) => handleSearch(e.target.value)}
        className="bg-[var(--surface-raised)] border-[var(--border-subtle)] text-[var(--ink)] placeholder:text-[var(--ink-dim)] focus-visible:ring-[var(--accent-glow)] focus-visible:border-[var(--accent)]"
      />

      <ToggleGroup
        type="single"
        value={filter}
        onValueChange={(v) => v && setFilter(v)}
        className="flex flex-wrap gap-1.5 justify-start"
      >
        {ENTRY_TYPES.map((type) => (
          <ToggleGroupItem
            key={type}
            value={type}
            className="px-3 py-1.5 text-[0.75rem] font-medium rounded-full border border-[var(--border-subtle)] bg-[var(--surface-raised)] text-[var(--ink-muted)] data-[state=on]:bg-[var(--accent-soft)] data-[state=on]:text-[var(--accent)] data-[state=on]:border-[var(--accent-soft)]"
          >
            {type === "all" ? "All" : type.charAt(0).toUpperCase() + type.slice(1) + "s"}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <ScrollArea className="flex-1">
        {loading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-lg bg-[var(--surface)]" />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-12 text-[var(--ink-dim)]">
            <p className="font-[var(--font-display)] text-[1.25rem] italic text-[var(--ink-muted)]">
              No entries yet
            </p>
            <p className="text-[0.75rem] mt-2">Start capturing to build your knowledge base.</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {entries.map((entry) => (
              <li
                key={entry.slug}
                className="flex items-center gap-3 px-4 py-3 bg-[var(--surface)] border border-[var(--border-subtle)] rounded-lg cursor-pointer transition-all duration-300 hover:border-[var(--accent)] hover:shadow-[0_2px_8px_var(--accent-glow)]"
              >
                {entry.entry_type && (
                  <Badge
                    variant="secondary"
                    className="text-[0.75rem] uppercase tracking-wider bg-[var(--accent-soft)] text-[var(--accent)] border-none"
                  >
                    {entry.entry_type}
                  </Badge>
                )}
                <span className="text-[1rem] text-[var(--ink)]">{entry.title}</span>
                <span className="ml-auto text-[0.75rem] text-[var(--ink-dim)] flex items-center gap-1">
                  <Icon name="LinkOne" size={12} className="!text-[var(--ink-dim)]" />
                  {entry.tags.length}
                </span>
              </li>
            ))}
          </ul>
        )}
      </ScrollArea>
    </div>
  );
}
