import { ActOne } from './story/ActOne.tsx';
import { LabLifecycleNotice } from '@lvbt/ui';
import manifest from '../lab.config';

export function App() {
  return (
    <>
      <header className="lab-header">
        <a className="lab-brand" href="/" aria-label="LVBT Labs home">
          <img
            src="/transit-funding/brand/lvbt-wordmark.svg"
            alt="Las Vegas for Better Transit"
            width="214"
            height="49"
          />
          <span>Labs</span>
        </a>
        <span className="lab-project">Transit Funding</span>
      </header>
      <main>
        <LabLifecycleNotice manifest={manifest} />
        <ActOne />
      </main>
    </>
  );
}
