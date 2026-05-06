"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function renameProject(projectId: string, newName: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("projects")
    .update({ name: newName })
    .eq("id", projectId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/", "layout");
}

export async function deleteProject(projectId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("projects")
    .delete()
    .eq("id", projectId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/", "layout");
}
