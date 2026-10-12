import type { S2ContentMap } from "./seedtypes";
import { bankingS2 } from "./banking";
import { energyS2 } from "./energy";
import { infrastructureS2 } from "./infrastructure";
import { insuranceS2 } from "./insurance";
import { logisticsS2 } from "./logistics";
import { manufacturingS2 } from "./manufacturing";
import { realestateS2 } from "./realestate";
import { sovereignS2 } from "./sovereign";

/** Static Stage 2 content per sector: people, objectives, readable evidence, new signals and the seeded investigation. */
export const S2: S2ContentMap = {
  energy: energyS2, banking: bankingS2, insurance: insuranceS2, manufacturing: manufacturingS2,
  logistics: logisticsS2, realestate: realestateS2, infrastructure: infrastructureS2, sovereign: sovereignS2,
};
