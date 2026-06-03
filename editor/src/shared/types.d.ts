// types.d.ts — `ctx` typings exposed to the Monaco editor so the user
// gets autocomplete + jump-to-definition while editing script bodies.
//
// This file is loaded as an `extraLib` into the Monaco TypeScript
// worker; it is not consumed by the runtime.

declare type AxiomLogLevel = "log" | "info" | "warn" | "error" | "debug";

declare interface AxiomGame {
  /** Convenience handle to `window`. Use to reach game globals you discover. */
  window: any;
  /** Indexer — any property on the page's global is reachable as `ctx.game.foo`. */
  readonly [key: string]: any;
}

declare interface AxiomUiCtx {
  /** Read another control's current value by its schema id. */
  getValue<T = any>(controlId: string): T | undefined;
  /** Set another control's value (persists + updates DOM). */
  setValue(controlId: string, value: any): boolean;
  /** Re-fires the script attached to the named control. */
  trigger(controlId: string): boolean;
}

declare interface AxiomStorage {
  get<T = any>(key: string, fallback?: T): T;
  set(key: string, value: any): void;
  delete(key: string): Promise<void>;
}

declare interface AxiomCtx {
  /** Read game state. `ctx.game.window` is a safe alias for `window`. */
  readonly game: AxiomGame;
  /** Cross-control read/write. */
  readonly ui: AxiomUiCtx;
  /** Per-script persistence (Web Cache). */
  readonly storage: AxiomStorage;
  /** Write a line to the in-UI console panel. */
  log(message: any, level?: AxiomLogLevel): void;
  /** Subscribe to an event. Returns a handle with `.off()`. */
  on(event: string, handler: (...args: any[]) => void): { off(): void };
  /** Unsubscribe by event name + handler reference. */
  off(event: string, handler: (...args: any[]) => void): void;
  /** Pop a toast (uses ZOUI's popup system). */
  toast(message: string, type?: "info" | "success" | "warning" | "error", duration?: number): void;
}

/** Injected by the script host on every invocation. */
declare const ctx: AxiomCtx;

/** Present for change-bound controls (toggle, slider, input, etc.). */
declare const value: any;

/** Present on every invocation — the id of the control that fired the script. */
declare const controlId: string;
