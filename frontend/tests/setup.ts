import "@testing-library/jest-dom/vitest";
import { beforeEach } from "vitest";

/**
 * In-memory Web Storage shim (publisher-env-jsdom).
 *
 * Node 25 ships an experimental built-in Web Storage that collides with jsdom's
 * implementation, leaving `window.localStorage` without a working `clear()` — so
 * any test that touches storage (auth token persistence, etc.) dies with
 * "window.localStorage.clear is not a function". Installing a clean,
 * spec-shaped Storage before each test gives every Node version predictable
 * localStorage/sessionStorage and removes the dependency on jsdom's flaky one.
 */
function makeStorage(): Storage {
  const store = new Map<string, string>();
  // Cast: this literal implements every method/prop of the Storage interface;
  // the `as Storage` only satisfies its `[name: string]: any` index signature,
  // which a plain object can't declare. Safe — it's a complete Storage shape.
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? (store.get(key) as string) : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  } as Storage;
}

function installStorage(name: "localStorage" | "sessionStorage"): void {
  const storage = makeStorage();
  const descriptor = { value: storage, configurable: true, writable: true };
  Object.defineProperty(globalThis, name, descriptor);
  if (typeof window !== "undefined") {
    Object.defineProperty(window, name, descriptor);
  }
}

beforeEach(() => {
  installStorage("localStorage");
  installStorage("sessionStorage");
});
