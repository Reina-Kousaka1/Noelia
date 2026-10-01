export function buildPingResponse(gatewayLatency: number | undefined): string {
  const gatewayLine =
    gatewayLatency !== undefined && Number.isFinite(gatewayLatency) && gatewayLatency >= 0
      ? ` Gateway: ${Math.round(gatewayLatency)} ms.`
      : '';

  return `Pong! Noélia is ready. 🩰${gatewayLine}`;
}
