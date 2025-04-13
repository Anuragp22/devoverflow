import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

import handleError from "@/lib/handlers/error";
import { ValidationError } from "@/lib/http-errors";
import { AIAnswerSchema } from "@/lib/validations";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!); // ← make sure it's defined

export async function POST(req: Request) {
  const { question, content, userAnswer } = await req.json();

  try {
    const validatedData = AIAnswerSchema.safeParse({
      question,
      content,
    });

    if (!validatedData.success) {
      throw new ValidationError(validatedData.error.flatten().fieldErrors);
    }

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const result = await model.generateContent([
      `Generate a markdown-formatted response to the following question: "${question}".  

Consider the provided context:  
**Context:** ${content}  

Also, prioritize and incorporate the user's answer when formulating your response:  
**User's Answer:** ${userAnswer}  

Prioritize the user's answer only if it's correct. If it's incomplete or incorrect, improve or correct it while keeping the response concise and to the point. 
Provide the final answer in markdown format.`,
    ]);

    const response = result.response;
    const text = response.text();

    return NextResponse.json({ success: true, data: text }, { status: 200 });
  } catch (error) {
    return handleError(error, "api") as APIErrorResponse;
  }
}
