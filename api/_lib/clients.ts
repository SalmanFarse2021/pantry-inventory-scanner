import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";

// Service-key client: server only, bypasses RLS.
export const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false },
});
export const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
