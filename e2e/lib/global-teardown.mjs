import { release } from './run-lock.mjs';
export default function globalTeardown() {
  release();
}
