// =============================================================================
// AI-assisted metadata tagging (REQ-ING-005)
//
// Tags historical method statements with: trade, activity, project, client,
// work type, plant/equipment, safety risk type, temporary works relevance,
// QA/QC relevance, environmental relevance, approval status, version/date.
// Tags are AI-generated and must be user-editable before KB admission.
// =============================================================================

import type { LLMProvider } from "../llm/index";
import type { ExtractedChunk } from "./index";

export interface DocumentTags {
  trade: string | null;
  activity: string | null;
  projectName: string | null;
  client: string | null;
  workType: string | null;
  plantEquipment: string[];
  safetyRiskTypes: string[];
  temporaryWorksRelevant: boolean;
  qaQcRelevant: boolean;
  environmentalRelevant: boolean;
  approvalStatus: "approved" | "draft" | "superseded" | "unknown";
  version: string | null;
  documentDate: string | null; // ISO date string or null
  confidence: number; // 0–1
}

const TAGGING_PROMPT = `You are a construction document analyst. Analyse the following extracted text from a method statement and extract structured metadata.

Return ONLY valid JSON with exactly these fields:
{
  "trade": string or null,           // e.g. "Excavation and Lateral Support"
  "activity": string or null,        // specific sub-activity
  "projectName": string or null,
  "client": string or null,
  "workType": string or null,        // e.g. "Civil", "Structural", "MEP"
  "plantEquipment": string[],        // list of plant/equipment types mentioned
  "safetyRiskTypes": string[],       // e.g. ["Working at height", "Confined spaces"]
  "temporaryWorksRelevant": boolean,
  "qaQcRelevant": boolean,
  "environmentalRelevant": boolean,
  "approvalStatus": "approved" | "draft" | "superseded" | "unknown",
  "version": string or null,         // document version/revision
  "documentDate": string or null,    // ISO date YYYY-MM-DD if found, else null
  "confidence": number               // your confidence 0–1 in these tags
}

Supported trades: Excavation and Lateral Support, Piling, Earthworks, Concrete Works, Formwork and Rebar, Structural Steel, Precast, Façade, Waterproofing, Drainage, Utilities Diversion, Roadworks, Temporary Works, Lifting Operations, Demolition, Building Services and MEP, Testing and Commissioning, Fit-Out, Railway, Marine, Traffic Management, Environmental Mitigation.

Document text:
`;

export async function tagDocument(
  chunks: ExtractedChunk[],
  llm: LLMProvider
): Promise<DocumentTags> {
  // Use first ~4000 chars of extracted text — enough to identify metadata
  const sampleText = chunks
    .filter((c) => c.type === "text")
    .slice(0, 20)
    .map((c) => c.content)
    .join("\n\n")
    .slice(0, 4000);

  if (!sampleText.trim()) {
    return emptyTags();
  }

  try {
    const response = await llm.complete({
      messages: [
        { role: "user", content: TAGGING_PROMPT + sampleText },
      ],
      maxTokens: 600,
      temperature: 0.1,
    });

    const raw = extractJson(response.content);
    if (!raw) return emptyTags();

    const parsed = JSON.parse(raw);
    return sanitiseTags(parsed);
  } catch {
    return emptyTags();
  }
}

function extractJson(text: string): string | null {
  // Extract JSON object from model response
  const match = text.match(/\{[\s\S]*\}/);
  return match ? match[0] : null;
}

function sanitiseTags(raw: any): DocumentTags {
  return {
    trade: typeof raw.trade === "string" ? raw.trade : null,
    activity: typeof raw.activity === "string" ? raw.activity : null,
    projectName: typeof raw.projectName === "string" ? raw.projectName : null,
    client: typeof raw.client === "string" ? raw.client : null,
    workType: typeof raw.workType === "string" ? raw.workType : null,
    plantEquipment: Array.isArray(raw.plantEquipment)
      ? raw.plantEquipment.filter((x: any) => typeof x === "string")
      : [],
    safetyRiskTypes: Array.isArray(raw.safetyRiskTypes)
      ? raw.safetyRiskTypes.filter((x: any) => typeof x === "string")
      : [],
    temporaryWorksRelevant: Boolean(raw.temporaryWorksRelevant),
    qaQcRelevant: Boolean(raw.qaQcRelevant),
    environmentalRelevant: Boolean(raw.environmentalRelevant),
    approvalStatus: ["approved", "draft", "superseded"].includes(raw.approvalStatus)
      ? raw.approvalStatus
      : "unknown",
    version: typeof raw.version === "string" ? raw.version : null,
    documentDate: isIsoDate(raw.documentDate) ? raw.documentDate : null,
    confidence: typeof raw.confidence === "number" ? Math.min(1, Math.max(0, raw.confidence)) : 0.5,
  };
}

function isIsoDate(value: any): boolean {
  if (typeof value !== "string") return false;
  return /^\d{4}-\d{2}-\d{2}/.test(value);
}

function emptyTags(): DocumentTags {
  return {
    trade: null,
    activity: null,
    projectName: null,
    client: null,
    workType: null,
    plantEquipment: [],
    safetyRiskTypes: [],
    temporaryWorksRelevant: false,
    qaQcRelevant: false,
    environmentalRelevant: false,
    approvalStatus: "unknown",
    version: null,
    documentDate: null,
    confidence: 0,
  };
}
