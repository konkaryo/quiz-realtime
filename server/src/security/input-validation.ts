import { z } from "zod";
import { isCodeValid } from "../domain/room/room.service";

export const MAX_EMAIL_LENGTH = 254;
export const MAX_PASSWORD_LENGTH = 256;
export const MAX_DISPLAY_NAME_LENGTH = 64;
export const MAX_ANSWER_LENGTH = 256;

const noControlCharacters = (value: string) => !/[\u0000-\u001F\u007F-\u009F]/u.test(value);

export const emailSchema = z.string().trim().min(3).max(MAX_EMAIL_LENGTH).email().transform((value) => value.toLowerCase());
export const passwordSchema = z.string().min(8).max(MAX_PASSWORD_LENGTH);
export const displayNameSchema = z.string().trim().min(1).max(MAX_DISPLAY_NAME_LENGTH)
  .refine(noControlCharacters, "control_characters_not_allowed");

// Database-generated identifiers are either CUIDs or the project's grouped IDs.
// Keeping this deliberately broad avoids coupling validation to legacy imported rows.
export const identifierSchema = z.string().trim().min(1).max(128)
  .regex(/^[A-Za-z0-9_-]+(?:-[A-Za-z0-9_-]+)*$/u);
export const roomCodeSchema = z.string().trim().toUpperCase().refine(isCodeValid, "invalid_room_code");
export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).refine((value) => {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}, "invalid_date");
export const answerTextSchema = z.string().trim().min(1).max(MAX_ANSWER_LENGTH)
  .refine(noControlCharacters, "control_characters_not_allowed");

export const registerBodySchema = z.strictObject({
  email: emailSchema,
  password: passwordSchema,
  displayName: displayNameSchema.optional(),
  name: displayNameSchema.optional(),
  username: displayNameSchema.optional(),
});
export const loginBodySchema = z.strictObject({ email: emailSchema, password: z.string().min(1).max(MAX_PASSWORD_LENGTH) });
export const answerTextPayloadSchema = z.strictObject({ text: answerTextSchema });
export const choicePayloadSchema = z.strictObject({ choiceId: identifierSchema });
export const gameChoicePayloadSchema = z.strictObject({
  choiceId: identifierSchema,
  // Kept for wire compatibility with the current client; room identity always
  // comes from the authenticated socket state and this value is never trusted.
  code: z.string().max(16).optional(),
});
export const joinGamePayloadSchema = z.strictObject({
  code: roomCodeSchema.optional(),
  roomId: identifierSchema.optional(),
}).refine((value) => Number(Boolean(value.code)) + Number(Boolean(value.roomId)) === 1, "provide_exactly_one_room_locator");