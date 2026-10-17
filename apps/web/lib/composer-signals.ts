import type { MessageSignals } from "./authenticity-rules";

/**
 * What the composer measures of how a message arrives — **counters only**: how long it took from the first character to the send,
 * how many characters were typed and how many came in a paste, how many deletions. No keystroke is kept, no timing series, no text:
 * the counters are what `authenticity-rules.ts` reads with the text's level, and they are stored with the message (and gone with it).
 * Pure: the component feeds it `beforeinput` events, the tests feed it the same.
 */
export class ComposerTracker {
  private firstAt: number | null = null;
  private typedChars = 0;
  private pastedChars = 0;
  private pasteEvents = 0;
  private deletions = 0;

  /** One `beforeinput` event: its `inputType` and the number of characters it brings. */
  input(inputType: string, length: number, now: number): void {
    if (inputType.startsWith("delete")) {
      this.deletions += 1;
      return;
    }
    this.firstAt ??= now;
    if (inputType === "insertFromPaste" || inputType === "insertFromDrop" || inputType === "insertFromYank") {
      this.pastedChars += length;
      this.pasteEvents += 1;
    } else if (inputType.startsWith("insert")) {
      this.typedChars += length;
    }
  }

  /** The counters at the moment of sending; undefined when nothing was measured (the composer was not used: another client, a script). */
  snapshot(now: number): MessageSignals | undefined {
    if (this.firstAt === null) return undefined;
    return { typedMs: Math.max(0, Math.round(now - this.firstAt)), typedChars: this.typedChars, pastedChars: this.pastedChars, pasteEvents: this.pasteEvents, deletions: this.deletions };
  }

  reset(): void {
    this.firstAt = null;
    this.typedChars = this.pastedChars = this.pasteEvents = this.deletions = 0;
  }
}
