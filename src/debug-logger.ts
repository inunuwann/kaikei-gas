type DebugDetails = Record<string, unknown>;

interface DebugTimer {
  end(details?: DebugDetails): void;
  fail(error: unknown, details?: DebugDetails): void;
}

export class ServerDebugLogger {
  private readonly scope: string;
  private readonly baseDetails: DebugDetails;

  constructor(scope: string, baseDetails: DebugDetails = {}) {
    this.scope = scope;
    this.baseDetails = baseDetails;
  }

  child(scopeSuffix: string, baseDetails: DebugDetails = {}): ServerDebugLogger {
    return new ServerDebugLogger(`${this.scope}.${scopeSuffix}`, this.merge(baseDetails));
  }

  log(message: string, details: DebugDetails = {}): void {
    writeServerLog('log', this.scope, message, this.merge(details));
  }

  warn(message: string, details: DebugDetails = {}): void {
    writeServerLog('warn', this.scope, message, this.merge(details));
  }

  error(message: string, details: DebugDetails = {}): void {
    writeServerLog('error', this.scope, message, this.merge(details));
  }

  startTimer(label: string, details: DebugDetails = {}): DebugTimer {
    const startedAt = Date.now();
    this.log(`${label}:start`, details);

    return {
      end: (endDetails = {}) => {
        this.log(`${label}:end`, {
          durationMs: Date.now() - startedAt,
          ...endDetails,
        });
      },
      fail: (error, endDetails = {}) => {
        this.error(`${label}:error`, {
          durationMs: Date.now() - startedAt,
          error,
          ...endDetails,
        });
      },
    };
  }

  private merge(details: DebugDetails): DebugDetails {
    return {
      ...this.baseDetails,
      ...details,
    };
  }
}

export function createServerDebugLogger(
  scope: string,
  baseDetails: DebugDetails = {},
): ServerDebugLogger {
  return new ServerDebugLogger(scope, baseDetails);
}

export function maskEmail(email: string): string {
  const normalized = String(email ?? '').trim();
  if (!normalized.includes('@')) {
    return normalized;
  }

  const [localPart, domainPart] = normalized.split('@');
  if (!domainPart) {
    return normalized;
  }

  if (localPart.length <= 1) {
    return `*@${domainPart}`;
  }

  if (localPart.length === 2) {
    return `${localPart[0]}*@${domainPart}`;
  }

  return `${localPart.slice(0, 2)}***@${domainPart}`;
}

function writeServerLog(
  level: 'log' | 'warn' | 'error',
  scope: string,
  message: string,
  details: DebugDetails,
): void {
  const timestamp = new Date().toISOString();
  const serialized = serializeDebugPayload(details);
  const suffix = serialized ? ` ${serialized}` : '';
  console[level](`[KaikeiDebug][${timestamp}][${scope}] ${message}${suffix}`);
}

function serializeDebugPayload(details: DebugDetails): string {
  const entries = Object.entries(details).filter(([, value]) => value !== undefined);
  if (entries.length === 0) {
    return '';
  }

  try {
    return JSON.stringify(Object.fromEntries(entries), (_key, value) => normalizeDebugValue(value));
  } catch (error) {
    return JSON.stringify({
      serializationError: normalizeDebugValue(error),
    });
  }
}

function normalizeDebugValue(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Map) {
    return Object.fromEntries(value.entries());
  }

  return value;
}
