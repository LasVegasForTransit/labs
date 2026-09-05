export interface LifecycleManifest {
  status: string;
  lifecycle?: { reason?: string | undefined; sunset?: string | undefined } | undefined;
  successor?: { url: string; label: string } | undefined;
}

export interface LifecycleNoticeProps {
  status: 'deprecated' | 'retired';
  reason: string;
  sunset?: string;
  successor?: { href: string; label: string };
}

export function lifecycleNotice(manifest: LifecycleManifest): LifecycleNoticeProps | undefined {
  if (manifest.status !== 'deprecated' && manifest.status !== 'retired') return undefined;
  const reason = manifest.lifecycle?.reason;
  if (!reason?.trim()) throw new Error('A lifecycle notice requires a reason.');
  const sunset = manifest.status === 'deprecated' ? manifest.lifecycle?.sunset : undefined;
  if (manifest.status === 'deprecated' && sunset === undefined) {
    throw new Error('A deprecated lab requires a sunset date.');
  }
  return {
    status: manifest.status,
    reason,
    ...(sunset === undefined ? {} : { sunset }),
    ...(manifest.successor === undefined
      ? {}
      : {
          successor: { href: manifest.successor.url, label: manifest.successor.label },
        }),
  };
}

export function formatSunset(date: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));
}
