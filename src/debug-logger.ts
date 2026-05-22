import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const SECRET_KEYS = /api[_-]?key|authorization|token|secret|password/i;

export interface DebugLoggerOptions {
  extensionRoot: string;
  debug: boolean;
}

function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((entry) => redactSecrets(entry));
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      output[key] = SECRET_KEYS.test(key) ? "[REDACTED]" : redactSecrets(nestedValue);
    }
    return output;
  }
  return value;
}

function stringifyDetails(details: unknown): string {
  if (details === undefined) return "";
  try {
    return ` ${JSON.stringify(redactSecrets(details))}`;
  } catch {
    return " [unserializable-details]";
  }
}

export class DebugLogger {
  private readonly debugDir: string;
  private readonly logPath: string;
  private debugDirEnsured = false;
  private writeQueue: Promise<void> = Promise.resolve();

  private readonly options: DebugLoggerOptions;

  constructor(options: DebugLoggerOptions) {
    this.options = options;
    this.debugDir = join(options.extensionRoot, "debug");
    this.logPath = join(this.debugDir, "debug.log");
  }

  debug(event: string, details?: unknown): void {
    this.write("debug", event, details);
  }

  warn(event: string, details?: unknown): void {
    this.write("warn", event, details);
  }

  error(event: string, details?: unknown): void {
    this.write("error", event, details);
  }

  flush(): Promise<void> {
    return this.writeQueue.catch(() => undefined);
  }

  private async ensureDebugDir(): Promise<void> {
    if (this.debugDirEnsured) return;
    await mkdir(this.debugDir, { recursive: true });
    this.debugDirEnsured = true;
  }

  private write(level: "debug" | "warn" | "error", event: string, details?: unknown): void {
    if (!this.options.debug) return;
    const line = `${JSON.stringify({ timestamp: new Date().toISOString(), level, extension: "pi-command-code-provider", event })}${stringifyDetails(details)}\n`;
    this.writeQueue = this.writeQueue.then(
      () => this.appendLine(line),
      () => this.appendLine(line),
    );
    void this.writeQueue.catch(() => {
      // Debug logging must never affect provider behavior or terminal output.
    });
  }

  private async appendLine(line: string): Promise<void> {
    await this.ensureDebugDir();
    await appendFile(this.logPath, line, "utf-8");
  }
}
