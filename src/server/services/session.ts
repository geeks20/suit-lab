import type { SessionDTO } from "@/lib/api-types";
import type { ServiceContext } from "./context";
import { generationDTO, getCapabilities, recentResults } from "./generations";
import { listLooks, lookDTO } from "./looks";
import { getCurrentProfile, profileDTO } from "./profiles";

export async function getSession(ctx: ServiceContext, userId: string | null): Promise<SessionDTO> {
  const capabilities = await getCapabilities(ctx);
  if (!userId) return { profile: null, generations: [], looks: [], capabilities };
  const profile = await getCurrentProfile(ctx, userId);
  const [gens, lookRows] = await Promise.all([profile ? recentResults(ctx, userId, profile.id) : [], listLooks(ctx, userId)]);
  return {
    profile: profile ? await profileDTO(ctx, profile) : null,
    generations: await Promise.all(gens.map((g) => generationDTO(ctx, g))),
    looks: await Promise.all(lookRows.map((l) => lookDTO(ctx, l))),
    capabilities,
  };
}
