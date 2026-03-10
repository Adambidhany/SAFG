import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface Question {
  question: string;
  options: string[];
  correctAnswer: number;
}

export async function generateQuizQuestions(): Promise<Question[]> {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: "Generate 5 diverse computer science quiz questions in Arabic. Include different difficulty levels. Return as a JSON array of objects with 'question', 'options' (array of 4 strings), and 'correctAnswer' (index 0-3).",
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            question: { type: Type.STRING },
            options: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              minItems: 4,
              maxItems: 4
            },
            correctAnswer: { type: Type.INTEGER }
          },
          required: ["question", "options", "correctAnswer"]
        }
      }
    }
  });

  try {
    return JSON.parse(response.text);
  } catch (e) {
    console.error("Failed to parse questions", e);
    return [];
  }
}
