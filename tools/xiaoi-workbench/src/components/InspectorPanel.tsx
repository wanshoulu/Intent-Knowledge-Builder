import type { ReactNode } from 'react';

export function InspectorPanel({
  title = '质量检查器',
  children
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <aside className="inspector-panel">
      <div className="inspector-title">{title}</div>
      {children}
    </aside>
  );
}
