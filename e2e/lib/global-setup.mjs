/** Playwright globalSetup — holds the run lock for the whole test phase.
 *  See lib/run-lock.mjs for why the suite is not re-entrant. */
import { acquire } from './run-lock.mjs';

export default function globalSetup() {
  acquire('playwright test');
}
