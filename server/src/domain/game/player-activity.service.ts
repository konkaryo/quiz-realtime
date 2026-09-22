const INACTIVE_AFTER_QUESTIONS = 5;

type PlayerActivity = { unansweredQuestions: number; inactive: boolean };

const activityByRoom = new Map<string, Map<string, PlayerActivity>>();

function roomActivity(roomId: string) {
  let activity = activityByRoom.get(roomId);
  if (!activity) {
    activity = new Map();
    activityByRoom.set(roomId, activity);
  }
  return activity;
}

export function markPlayerActive(roomId: string, playerId: string) {
  roomActivity(roomId).set(playerId, { unansweredQuestions: 0, inactive: false });
}

export function completeQuestionForPlayers(roomId: string, playerIds: string[], attemptedPlayerIds: Set<string>) {
  const activity = roomActivity(roomId);
  for (const playerId of playerIds) {
    if (attemptedPlayerIds.has(playerId)) {
      activity.set(playerId, { unansweredQuestions: 0, inactive: false });
      continue;
    }
    const unansweredQuestions = (activity.get(playerId)?.unansweredQuestions ?? 0) + 1;
    activity.set(playerId, { unansweredQuestions, inactive: unansweredQuestions >= INACTIVE_AFTER_QUESTIONS });
  }
}

export function isPlayerInactive(roomId: string, playerId: string) {
  return activityByRoom.get(roomId)?.get(playerId)?.inactive ?? false;
}