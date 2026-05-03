"use client";

import { useEffect, useState } from "react";
import { isSoundEnabled, setSoundEnabled, sounds } from "@/lib/sound";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
};

export function SoundToggle({ className }: Props) {
  const [enabled, setEnabled] = useState<boolean>(true);

  useEffect(() => {
    setEnabled(isSoundEnabled());
  }, []);

  const handleClick = () => {
    const next = !enabled;
    setSoundEnabled(next);
    setEnabled(next);
    if (next) sounds.start();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={enabled ? "소리 끄기" : "소리 켜기"}
      title={enabled ? "소리 끄기" : "소리 켜기"}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-sm",
        "border border-transparent text-foreground",
        "hover:border-border transition-colors duration-150",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className,
      )}
    >
      {enabled ? (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M11 5L6 9H2v6h4l5 4z" />
          <path d="M15.5 8.5a5 5 0 0 1 0 7" />
          <path d="M19 5a9 9 0 0 1 0 14" />
        </svg>
      ) : (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M11 5L6 9H2v6h4l5 4z" />
          <line x1="22" y1="9" x2="16" y2="15" />
          <line x1="16" y1="9" x2="22" y2="15" />
        </svg>
      )}
    </button>
  );
}
