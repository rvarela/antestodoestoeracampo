"use server";

import { createClient } from "@sanity/client";

function serverClient() {
  return createClient({
    projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!,
    dataset: (process.env.NEXT_PUBLIC_SANITY_DATASET ?? "production").replace(/["']/g, ""),
    token: process.env.SANITY_WRITE_TOKEN!,
    apiVersion: "2026-05-19",
    useCdn: false,
  });
}

/** Hide or restore a case from the triage view. */
export async function setCaseHidden(slug: string, hidden: boolean) {
  const id = await serverClient().fetch<string | null>(
    `*[_type == "case" && slug.current == $slug][0]._id`,
    { slug }
  );
  if (!id) throw new Error(`Case not found: ${slug}`);
  await serverClient().patch(id).set({ hidden }).commit();
}
