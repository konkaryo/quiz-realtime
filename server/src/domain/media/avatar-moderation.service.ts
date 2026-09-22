import OpenAI from "openai";

const MODERATION_MODEL = "omni-moderation-latest";

let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  openaiClient ??= new OpenAI({ apiKey });
  return openaiClient;
}

export async function moderateProfileImage(image: Buffer, mimeType: string): Promise<boolean> {
  const moderation = await getOpenAIClient().moderations.create({
    model: MODERATION_MODEL,
    input: [
      {
        type: "image_url",
        image_url: { url: `data:${mimeType};base64,${image.toString("base64")}` },
      },
    ],
  });

  const result = moderation.results[0];
  if (!result) {
    throw new Error("Moderation response did not contain a result");
  }

  return result.flagged;
}