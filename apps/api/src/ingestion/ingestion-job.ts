export function deliveryJobId(id: string) {
  // Twitch IDs are opaque; BullMQ reserves colons. Encoding is deterministic and lossless.
  return `delivery-${Buffer.from(id).toString('base64url')}`;
}
