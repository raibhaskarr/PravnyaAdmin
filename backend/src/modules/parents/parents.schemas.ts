import { z } from "zod";

export const parentParamsSchema = z.object({ parentId: z.string().uuid() });
