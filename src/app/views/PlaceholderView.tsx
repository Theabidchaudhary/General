interface PlaceholderViewProps {
  title: string;
  milestone: string;
  description: string;
}

/** Stub for feature modules scheduled in later milestones. */
export function PlaceholderView({ title, milestone, description }: PlaceholderViewProps) {
  return (
    <section aria-labelledby={`view-${title}`} className="space-y-2">
      <h2 id={`view-${title}`} className="text-base font-semibold">
        {title}
      </h2>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">{description}</p>
      <p className="inline-block rounded bg-neutral-200 px-2 py-0.5 text-xs text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
        Planned — {milestone}
      </p>
    </section>
  );
}
