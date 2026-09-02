export interface LifecycleNoticeProps {
  status: 'deprecated' | 'retired';
  reason: string;
  successor?: {
    href: string;
    label: string;
  };
}

export function LifecycleNotice({
  status,
  reason,
  successor,
}: LifecycleNoticeProps): React.JSX.Element {
  const label = status === 'deprecated' ? 'Deprecated' : 'Retired';

  return (
    <aside className="lvbt-lifecycle-notice" role="status">
      <strong>{label}</strong>
      <span>{reason}</span>
      {successor === undefined ? null : <a href={successor.href}>{successor.label}</a>}
    </aside>
  );
}
