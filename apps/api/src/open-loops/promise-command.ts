export function parsePromiseCommand(message: {
  broadcaster_user_id: string;
  chatter_user_id: string;
  message: { text: string };
  badges: { set_id: string }[];
  source_broadcaster_user_id?: string | null;
}) {
  if (
    message.source_broadcaster_user_id &&
    message.source_broadcaster_user_id !== message.broadcaster_user_id
  )
    return null;
  const authorized = message.badges.some(
    (badge) =>
      badge.set_id === 'moderator' ||
      (badge.set_id === 'broadcaster' &&
        message.chatter_user_id === message.broadcaster_user_id),
  );
  if (!authorized) return null;
  const match = /^!promise\s+([\s\S]+)$/i.exec(message.message.text.trim());
  const wording = match?.[1].trim();
  return wording && wording.length <= 2000 ? wording : null;
}
