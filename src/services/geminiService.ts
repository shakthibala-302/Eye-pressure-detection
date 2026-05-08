import { GoogleGenAI, Type } from "@google/genai";

// Standard Gemini initialization for AI Studio
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface EyeAnalysisResult {
  eccentricity: number;
  iop: number;
  status: string;
  report: string;
  simpleReport: string;
  glaucomaProbability: number;
}

const dataURLToBlob = (dataURL: string): Blob => {
  const arr = dataURL.split(',');
  const mime = arr[0].match(/:(.*?);/)![1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
};

export const uploadToGCS = async (dataUrl: string): Promise<string | null> => {
  try {
    const blob = dataURLToBlob(dataUrl);
    const formData = new FormData();
    formData.append('image', blob, 'analysis-capture.png');

    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
       console.warn('GCS upload failed (Check if bucket is configured in .env)');
       return null;
    }

    const data = await response.json();
    return data.url;
  } catch (err) {
    console.error('GCS Upload error:', err);
    return null;
  }
};

export const analyzeEyeImage = async (
  base64Image: string,
  mimeType: string,
  caseType: "Glaucoma" | "Normal" | "Real Captured" | "Fundus",
  language: string = "English"
): Promise<EyeAnalysisResult> => {
  const isFundus = caseType === "Fundus";
  const prompt = `
    TASK: Medical Diagnostic Screening for Glaucoma and High IOP.
    IMAGE TYPE: ${isFundus ? 'Retinal Fundus' : 'Corneal Ring Reflection'}.
    USER LABEL (CONTEXT ONLY): ${caseType}.
    
    INSTRUCTIONS:
    1. PRIORITIZE VISUAL EVIDENCE: Do not rely solely on the user label. If it's a "Normal" label but the image shows significant elliptical stretching (eccentricity > 0.8) or high cup-to-disc ratio (> 0.6), report it as HIGH RISK.
    2. ACCURACY: 
       - If Reflection: Measure eccentricity. Circular = Normal Pressure. Elliptical/Ovoid = High Pressure.
       - If Fundus: Evaluate the optic disc. Large cup = High Glaucoma risk.
    3. MULTILINGUAL OUTPUT: Provide both 'report' and 'simpleReport' in ${language}.
    4. REPORTS:
       - 'report': Professional clinical summary.
       - 'simpleReport': A "Layman's Summary" in very simple, friendly words for non-medical users.
    
    RESPONSE FORMAT: JSON.
    FIELDS:
    - eccentricity: number
    - iop: number
    - glaucomaProbability: number
    - status: string ("Normal" or "High Risk")
    - report: string
    - simpleReport: string
    
    IMPORTANT: Do not use 'AI'. Use 'Advanced Cloud Diagnostics'.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: {
        parts: [
          { inlineData: { data: base64Image, mimeType } },
          { text: prompt }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            eccentricity: { type: Type.NUMBER },
            iop: { type: Type.NUMBER },
            glaucomaProbability: { type: Type.NUMBER },
            status: { type: Type.STRING },
            report: { type: Type.STRING },
            simpleReport: { type: Type.STRING },
          },
          required: ["status", "report", "simpleReport"]
        }
      }
    });

    const result = JSON.parse(response.text || "{}");
    
    return {
      eccentricity: result.eccentricity ?? (isFundus ? 0 : 0.45),
      iop: result.iop ?? (isFundus ? 0 : 16),
      glaucomaProbability: result.glaucomaProbability ?? (isFundus ? 0.1 : 0),
      status: result.status ?? "Review Required",
      report: result.report ?? "Analysis complete.",
      simpleReport: result.simpleReport ?? "Diagnostics finished."
    };
  } catch (error) {
    console.error("Gemma-Cloud Analysis Error:", error);
    throw error;
  }
};
