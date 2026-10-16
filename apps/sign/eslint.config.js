import { config } from '@lasvegasfortransit/eslint-config/base';

export default [
  ...config,
  { ignores: ['dist/**', '.wrangler/**', 'playwright-report/**', 'test-results/**'] },
];
