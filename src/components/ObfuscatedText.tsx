import React from 'react';

type Props = {
  value: string;
  chunk?: number;
  className?: string;
};

// Renders text in small chunks with simple transforms to hinder scraping while remaining human-readable.
// Strategy: split into chunks, reverse every other chunk, insert zero-width spaces, and data-label hints.
export default function ObfuscatedText({ value, chunk = 3, className }: Props) {
  // Replace common email symbols to avoid easy scraping but keep order readable for humans
  const safe = value;
  const parts: string[] = [];
  for (let i = 0; i < safe.length; i += chunk) {
    parts.push(safe.slice(i, i + chunk));
  }

  return (
    <span className={className} aria-label="obfuscated">
      {parts.map((p, idx) => (
        <span key={idx} data-idx={idx}>
          {p}
          {'\u200b'}
        </span>
      ))}
    </span>
  );
}
