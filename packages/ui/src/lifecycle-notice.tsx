import {
  formatSunset,
  lifecycleNotice,
  type LifecycleManifest,
  type LifecycleNoticeProps,
} from './lifecycle.js';

export type { LifecycleNoticeProps } from './lifecycle.js';

export function LifecycleNotice({
  status,
  reason,
  successor,
  sunset,
}: LifecycleNoticeProps): React.JSX.Element {
  const label = status === 'deprecated' ? 'Deprecated' : 'Retired';

  return (
    <aside className="lvbt-lifecycle-notice" role="status">
      <strong>{label}</strong>
      <span>{reason}</span>
      {sunset === undefined ? null : (
        <span>
          Retires <time dateTime={sunset}>{formatSunset(sunset)}</time>.
        </span>
      )}
      {successor === undefined ? null : <a href={successor.href}>{successor.label}</a>}
    </aside>
  );
}

export function LabLifecycleNotice({
  manifest,
}: {
  manifest: LifecycleManifest;
}): React.JSX.Element | null {
  const notice = lifecycleNotice(manifest);
  return notice === undefined ? null : <LifecycleNotice {...notice} />;
}
