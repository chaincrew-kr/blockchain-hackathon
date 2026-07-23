import express, { type Express } from "express";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactSvmScheme } from "@x402/svm/exact/server";

import type { AppConfig } from "./config.js";

export function createApp(config: AppConfig): Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json());
  app.get("/health", (_request, response) => {
    response.json({ status: "ok" });
  });

  const facilitator = new HTTPFacilitatorClient({
    url: config.facilitatorUrl,
  });
  const resourceServer = new x402ResourceServer(facilitator).register(
    config.network,
    new ExactSvmScheme(),
  );

  app.use(
    paymentMiddleware(
      {
        "GET /api/costly-data": {
          accepts: [
            {
              scheme: "exact",
              price: config.price,
              network: config.network,
              payTo: config.payTo,
            },
          ],
          description: "ChainCrew premium agent data",
          mimeType: "application/json",
        },
      },
      resourceServer,
    ),
  );

  app.get("/api/costly-data", (_request, response) => {
    response.json({
      report: {
        data: "costly data",
        generatedAt: new Date().toISOString(),
        source: "chaincrew-x402",
      },
    });
  });

  return app;
}
