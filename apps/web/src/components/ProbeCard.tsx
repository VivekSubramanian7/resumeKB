import { useState } from "react";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

interface ProbeCardProps {
  question: string;
  context: string;
  onSave: (answer: string) => void;
  onSkip: () => void;
}

export function ProbeCard({ question, context, onSave, onSkip }: ProbeCardProps) {
  const [answer, setAnswer] = useState("");

  return (
    <Card className="w-full border-[var(--border-subtle)] bg-[var(--surface)] animate-[probe-enter_0.4s_var(--ease-out-expo)]">
      <CardHeader className="pb-0">
        <p className="font-[var(--font-display)] text-[1.5rem] font-normal italic leading-[1.35] text-[var(--ink)]">
          {question}
        </p>
        <p className="text-[0.75rem] text-[var(--ink-muted)] mt-2">
          {context}
        </p>
      </CardHeader>
      <CardContent className="pt-4">
        <Textarea
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="Type or tap record to answer with voice..."
          className="min-h-16 bg-[var(--bg)] border-[var(--border)] text-[var(--ink)] placeholder:text-[var(--ink-dim)] focus-visible:ring-[var(--accent-glow)] focus-visible:border-[var(--accent)]"
        />
      </CardContent>
      <CardFooter className="justify-between">
        <Button variant="ghost" onClick={onSkip} className="text-[0.75rem] text-[var(--ink-muted)]">
          Skip
        </Button>
        <Button
          onClick={() => onSave(answer)}
          disabled={!answer.trim()}
          className="text-[0.75rem] bg-[var(--accent)] text-[var(--bg)] hover:shadow-[0_4px_16px_var(--accent-glow)]"
        >
          Save answer
        </Button>
      </CardFooter>
    </Card>
  );
}
