import type { ReactNode } from "react";

export function PolicyPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated?: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold text-gray-900">{title}</h1>
      {updated ? <p className="mt-2 text-sm text-gray-500">Last updated: {updated}</p> : null}
      <div className="mt-8 space-y-6">{children}</div>
    </main>
  );
}

export function PolicySection({ heading, children }: { heading?: string; children: ReactNode }) {
  return (
    <section>
      {heading ? <h2 className="mb-2 text-base font-semibold text-gray-900">{heading}</h2> : null}
      <div className="space-y-3 text-sm leading-7 text-gray-600">{children}</div>
    </section>
  );
}

export function PolicyList({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5 text-sm leading-7 text-gray-600">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}
