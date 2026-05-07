import { db } from "./index";

const TRADES = [
  "Excavation and Lateral Support",
  "Piling",
  "Earthworks",
  "Concrete Works",
  "Formwork and Rebar",
  "Structural Steel",
  "Precast",
  "Façade",
  "Waterproofing",
  "Drainage",
  "Utilities Diversion",
  "Roadworks",
  "Temporary Works",
  "Lifting Operations",
  "Demolition",
  "Building Services and MEP",
  "Testing and Commissioning",
  "Fit-Out",
  "Railway",
  "Marine",
  "Traffic Management",
  "Environmental Mitigation",
];

const STANDARD_SECTIONS = [
  { key: "cover", title: "Cover Sheet", order: 0 },
  { key: "document_control", title: "Document Control", order: 1 },
  { key: "purpose", title: "Purpose", order: 2 },
  { key: "scope", title: "Scope", order: 3 },
  { key: "references", title: "References", order: 4 },
  { key: "definitions", title: "Definitions and Abbreviations", order: 5 },
  { key: "roles", title: "Roles and Responsibilities", order: 6 },
  { key: "location", title: "Location and Site Constraints", order: 7 },
  { key: "plant", title: "Plant and Equipment", order: 8 },
  { key: "materials", title: "Materials", order: 9 },
  { key: "labour", title: "Labour", order: 10 },
  { key: "permits", title: "Permits and Notifications", order: 11 },
  { key: "pre_commencement", title: "Pre-Commencement Checks", order: 12 },
  { key: "sequence", title: "Work Sequence", order: 13 },
  { key: "temporary_works", title: "Temporary Works", order: 14 },
  { key: "safety", title: "Safety Controls and Hazard Management", order: 15 },
  { key: "environmental", title: "Environmental Controls", order: 16 },
  { key: "qa_qc", title: "Quality Assurance and Control", order: 17 },
  { key: "hold_points", title: "Hold and Witness Points", order: 18 },
  { key: "interfaces", title: "Interfaces and Dependencies", order: 19 },
  { key: "emergency", title: "Emergency Procedures", order: 20 },
  { key: "housekeeping", title: "Housekeeping", order: 21 },
  { key: "records", title: "Records and Documentation", order: 22 },
  { key: "appendices", title: "Appendices", order: 23 },
];

const GAP_CATEGORIES = [
  "scope",
  "work_location",
  "sequence",
  "plant",
  "labour",
  "materials",
  "permits",
  "temporary_works",
  "access_logistics",
  "programme_constraints",
  "safety_risks",
  "environmental_controls",
  "qa_qc",
  "hold_witness_points",
  "monitoring",
  "emergency_procedures",
  "interfaces",
  "contract_references",
  "specification_references",
  "drawing_references",
  "roles_responsibilities",
  "other",
];

const VOCABULARY_TERMS = [
  {
    preferredTerm: "personal protective equipment (PPE)",
    prohibitedTerms: ["appropriate PPE", "suitable PPE", "required PPE"],
    category: "safety",
  },
  {
    preferredTerm: "as specified in [drawing/specification reference]",
    prohibitedTerms: ["as required", "where necessary", "where applicable"],
    category: "general",
  },
  {
    preferredTerm: "[named equipment] [capacity/specification]",
    prohibitedTerms: ["suitable equipment", "appropriate equipment", "relevant equipment"],
    category: "plant",
  },
  {
    preferredTerm: "[named inspection] at [frequency/milestone]",
    prohibitedTerms: ["inspection shall be carried out", "regular inspections"],
    category: "qa",
  },
  {
    preferredTerm: "[named supervisor/engineer] responsible for",
    prohibitedTerms: ["proper supervision", "adequate supervision", "supervised by competent person"],
    category: "role",
  },
  {
    preferredTerm: "[specific standard/code reference]",
    prohibitedTerms: ["relevant standards shall be followed", "in accordance with applicable standards"],
    category: "general",
  },
];

async function seed() {
  console.log("Seeding database...");

  const organisationId = process.env.DEFAULT_ORGANISATION_ID ?? "default";
  await db.organisation.upsert({
    where: { id: organisationId },
    update: {},
    create: {
      id: organisationId,
      name: process.env.DEFAULT_ORGANISATION_NAME ?? "Default Organisation",
    },
  });
  console.log(`✓ Seeded organisation ${organisationId}`);

  // Seed trades
  for (const tradeName of TRADES) {
    await db.trade.upsert({
      where: { name: tradeName },
      update: {},
      create: { name: tradeName },
    });
  }
  console.log(`✓ Seeded ${TRADES.length} trades`);

  // Seed vocabulary terms
  for (const term of VOCABULARY_TERMS) {
    await db.vocabularyTerm.upsert({
      where: { preferredTerm: term.preferredTerm },
      update: { prohibitedTerms: term.prohibitedTerms },
      create: {
        preferredTerm: term.preferredTerm,
        prohibitedTerms: term.prohibitedTerms,
        tradeScope: [],
        category: term.category,
      },
    });
  }
  console.log(`✓ Seeded ${VOCABULARY_TERMS.length} vocabulary terms`);

  console.log("Seeding complete.");
}

seed()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
