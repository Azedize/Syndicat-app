import { z } from "zod";

export const HealthCheckResponse = z.object({
  status: z.enum(["ok", "error"]),
  timestamp: z.string(),
});
export type HealthCheckResponse = z.infer<typeof HealthCheckResponse>;
