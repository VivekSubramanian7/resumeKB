import "@icon-park/react/styles/index.css";
import { type CSSProperties } from "react";
import {
  Microphone,
  Brain,
  Upload,
  Github,
  FileText,
  DocSearch,
  Voice,
  BookOpen,
  LinkOne,
} from "@icon-park/react";

const iconMap = {
  Microphone,
  Brain,
  Upload,
  Github,
  FileText,
  DocSearch,
  Voice,
  BookOpen,
  LinkOne,
} as const;

type IconName = keyof typeof iconMap;

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
  style?: CSSProperties;
}

export function Icon({ name, size = 20, className = "", style }: IconProps) {
  const Component = iconMap[name];
  return (
    <span
      className={`inline-flex transition-colors duration-200 text-[var(--ink-muted)] hover:text-[var(--accent)] ${className}`}
      style={style}
    >
      <Component theme="outline" size={size} strokeWidth={3} />
    </span>
  );
}
