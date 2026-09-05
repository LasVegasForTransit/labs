import type { previewTargets } from './pr-preview-plan.js';

type Target = ReturnType<typeof previewTargets>[number];
interface Receipt {
  version: string;
  url: string;
}
interface Result {
  target: Target;
  status: 'verified' | 'failed' | 'withheld';
  receipt?: Receipt;
  phase?: string;
}
interface Operations {
  build(): Promise<void>;
  assertCurrent(): Promise<void>;
  record(entry: { phase: string; target: Target; receipt?: Receipt }): Promise<void>;
  upload(target: Target): Promise<Receipt>;
  verify(target: Target, receipt: Receipt): Promise<void>;
}

async function publishOne(target: Target, operations: Operations): Promise<Result> {
  let phase = 'guard';
  let receipt: Receipt | undefined;
  try {
    await operations.assertCurrent();
    phase = 'journal';
    await operations.record({ phase: 'uploading', target });
    phase = 'upload';
    receipt = await operations.upload(target);
    phase = 'journal';
    await operations.record({ phase: 'uploaded', target, receipt });
    phase = 'verify';
    await operations.verify(target, receipt);
    phase = 'guard';
    await operations.assertCurrent();
    phase = 'journal';
    await operations.record({ phase: 'verified', target, receipt });
    return { target, status: 'verified', receipt };
  } catch {
    return { target, status: 'failed', phase, ...(receipt === undefined ? {} : { receipt }) };
  }
}

export async function publishPreviews(targets: Target[], operations: Operations) {
  const results: Result[] = [];
  if (targets.length === 0) return { ok: true, results };
  try {
    await operations.build();
  } catch {
    return { ok: false, results, phase: 'build' };
  }
  let stopped = false;
  for (const target of targets) {
    if (stopped) {
      results.push({ target, status: 'withheld' });
      continue;
    }
    const result = await publishOne(target, operations);
    results.push(result);
    stopped = result.status === 'failed' && result.phase !== 'verify';
  }
  return { ok: results.every((result) => result.status === 'verified'), results };
}
