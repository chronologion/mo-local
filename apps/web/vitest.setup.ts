// Shared Vitest setup for @mo/web tests.
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});

if (!HTMLElement.prototype.scrollIntoView) {
  HTMLElement.prototype.scrollIntoView = () => {
    // JSDOM doesn't implement this; Radix Select expects it.
  };
}
