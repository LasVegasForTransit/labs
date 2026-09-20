import { findAnalyticsReferences } from './archive-analytics';

const root = process.argv[2];
if (!root) throw new Error('Usage: check-archive <archive-directory>');

const findings = await findAnalyticsReferences(root);
if (findings.length) {
  throw new Error(`Archive contains analytics references:\n${findings.join('\n')}`);
}
