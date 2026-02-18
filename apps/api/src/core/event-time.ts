export type TimeTrustLevel = "HIGH" | "MEDIUM" | "LOW";
export type TimeSource = "SERVER" | "CLIENT";

export interface EventTimeContext {
  serverReceivedAt: Date;
  effectiveAt: Date;
  source: TimeSource;
  trustLevel: TimeTrustLevel;
  skewMinutes: number | null;
  anomaly: string | null;
}

export interface ResolveEventTimeOptions {
  maxPastHours: number;
  maxFutureMinutes: number;
  highTrustSkewMinutes: number;
}

const DEFAULT_OPTIONS: ResolveEventTimeOptions = {
  maxPastHours: 72,
  maxFutureMinutes: 2,
  highTrustSkewMinutes: 2,
};

export function resolveEventTime(
  clientTimestamp?: string,
  options: Partial<ResolveEventTimeOptions> = {},
): EventTimeContext {
  const cfg: ResolveEventTimeOptions = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  const serverReceivedAt = new Date();

  if (!clientTimestamp) {
    return {
      serverReceivedAt,
      effectiveAt: serverReceivedAt,
      source: "SERVER",
      trustLevel: "HIGH",
      skewMinutes: null,
      anomaly: null,
    };
  }

  const parsedClient = new Date(clientTimestamp);
  if (Number.isNaN(parsedClient.getTime())) {
    return {
      serverReceivedAt,
      effectiveAt: serverReceivedAt,
      source: "SERVER",
      trustLevel: "LOW",
      skewMinutes: null,
      anomaly: "INVALID_CLIENT_TIMESTAMP",
    };
  }

  const skewMinutes = Math.round(
    (serverReceivedAt.getTime() - parsedClient.getTime()) / 60000,
  );
  const absoluteSkew = Math.abs(skewMinutes);
  const maxFutureMs = cfg.maxFutureMinutes * 60 * 1000;
  const maxPastMs = cfg.maxPastHours * 60 * 60 * 1000;

  if (parsedClient.getTime() > serverReceivedAt.getTime() + maxFutureMs) {
    return {
      serverReceivedAt,
      effectiveAt: serverReceivedAt,
      source: "SERVER",
      trustLevel: "LOW",
      skewMinutes,
      anomaly: "CLIENT_TIME_TOO_FAR_IN_FUTURE",
    };
  }

  if (parsedClient.getTime() < serverReceivedAt.getTime() - maxPastMs) {
    return {
      serverReceivedAt,
      effectiveAt: parsedClient,
      source: "CLIENT",
      trustLevel: "LOW",
      skewMinutes,
      anomaly: "CLIENT_TIME_TOO_OLD",
    };
  }

  return {
    serverReceivedAt,
    effectiveAt: parsedClient,
    source: "CLIENT",
    trustLevel: absoluteSkew <= cfg.highTrustSkewMinutes ? "HIGH" : "MEDIUM",
    skewMinutes,
    anomaly: null,
  };
}

export function serializeEventTime(context: EventTimeContext): {
  serverReceivedAt: string;
  effectiveAt: string;
  source: TimeSource;
  trustLevel: TimeTrustLevel;
  skewMinutes: number | null;
  anomaly: string | null;
} {
  return {
    serverReceivedAt: context.serverReceivedAt.toISOString(),
    effectiveAt: context.effectiveAt.toISOString(),
    source: context.source,
    trustLevel: context.trustLevel,
    skewMinutes: context.skewMinutes,
    anomaly: context.anomaly,
  };
}
