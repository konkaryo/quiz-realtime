export const XP_THRESHOLDS = [
  0, 32, 97, 194, 323, 485, 680, 907, 1167, 1460, 1785, 2143, 2533, 2956, 3411, 3899,
  4419, 4972, 5558, 6176, 6827, 7510, 8226, 8974, 9755, 10568, 11414, 12293, 13204,
  14148, 15124, 16133, 17174, 18248, 19355, 20494, 21666, 22870, 24107, 25376, 26678,
  28012, 29379, 30779, 32211, 33676, 35173, 36703, 38265, 39860, 41488, 43148, 44841,
  46566, 48324, 50113, 51936, 53791, 55679, 57600,
];

export function getLevelProgress(experience: number) {
  const safeXp = Math.max(0, Math.floor(experience));
  let levelIndex = XP_THRESHOLDS.findIndex((threshold, index) => {
    const nextThreshold = XP_THRESHOLDS[index + 1];
    if (typeof nextThreshold !== "number") return true;
    return safeXp < nextThreshold;
  });
  if (levelIndex === -1) levelIndex = XP_THRESHOLDS.length - 1;
  const currentLevel = levelIndex + 1;
  const currentThreshold = XP_THRESHOLDS[levelIndex];
  const nextThreshold = XP_THRESHOLDS[levelIndex + 1] ?? currentThreshold;
  const gained = safeXp - currentThreshold;
  const needed = Math.max(0, nextThreshold - currentThreshold);
  const progress = needed > 0 ? Math.min(1, gained / needed) : 1;
  return {
    level: currentLevel,
    gained,
    needed,
    progress,
    nextThreshold,
  };
}

export function getLevelFromExperience(experience: number) {
  return getLevelProgress(experience).level;
}