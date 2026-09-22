const INACTIVE_AFTER_QUESTIONS = 5;

type PlayerActivity = { unansweredQuestions: number; inactive: boolean; randomPause?: boolean };

const activityByRoom = new Map<string, Map<string, PlayerActivity>>();

function roomActivity(roomId: string) {
  let activity = activityByRoom.get(roomId);
  if (!activity) {
    activity = new Map();
    activityByRoom.set(roomId, activity);
  }
  return activity;
}

export function markPlayerActive(roomId: string, playerId: string): boolean {
  const wasInactive = roomActivity(roomId).get(playerId)?.inactive ?? false;
  roomActivity(roomId).set(playerId, { unansweredQuestions: 0, inactive: false, randomPause: false });
  return wasInactive;
}

export function markBotRandomPause(roomId: string, playerId: string): boolean {
  const activity = roomActivity(roomId);
  const previous = activity.get(playerId) ?? { unansweredQuestions: 0, inactive: false };
  const inactive = previous.unansweredQuestions >= INACTIVE_AFTER_QUESTIONS;
  activity.set(playerId, {
    ...previous,
    inactive,
    randomPause: true,
  });
  return inactive && !previous.inactive;
}

export function clearBotRandomPause(roomId: string, playerId: string): boolean {
  const activity = roomActivity(roomId);
  const previous = activity.get(playerId);
  if (!previous) return false;
  activity.set(playerId, { ...previous, inactive: false, randomPause: false });
  return previous.inactive;
}

export function completeQuestionForPlayers(
  roomId: string,
  playerIds: string[],
  attemptedPlayerIds: Set<string>,
  botPlayerIds: Set<string> = new Set(),
) {
  const activity = roomActivity(roomId);
  for (const playerId of playerIds) {
    if (attemptedPlayerIds.has(playerId)) {
      activity.set(playerId, { unansweredQuestions: 0, inactive: false, randomPause: false });
      continue;
    }
    const previous = activity.get(playerId);
    const unansweredQuestions = (previous?.unansweredQuestions ?? 0) + 1;
    const thresholdReached = unansweredQuestions >= INACTIVE_AFTER_QUESTIONS;
    const canBecomeInactive = !botPlayerIds.has(playerId) || previous?.randomPause === true;
    activity.set(playerId, {
      unansweredQuestions,
      inactive: thresholdReached && canBecomeInactive,
      randomPause: previous?.randomPause ?? false,
    });
  }
}

export function isPlayerInactive(roomId: string, playerId: string) {
  return activityByRoom.get(roomId)?.get(playerId)?.inactive ?? false;
}