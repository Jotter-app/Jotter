import { getDefaultEventCreatesTask, getHideNoteOnlyTags } from "@/lib/actions/settings";
import { DefaultEventCreatesTaskToggle } from "@/components/settings/DefaultEventCreatesTaskToggle";
import { HideNoteOnlyTagsToggle } from "@/components/settings/HideNoteOnlyTagsToggle";

export default async function SettingsPage() {
  const [defaultEventCreatesTask, hideNoteOnlyTags] = await Promise.all([
    getDefaultEventCreatesTask(),
    getHideNoteOnlyTags(),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-5 p-6">
      <h1 className="font-heading text-2xl tracking-tight">Settings</h1>
      <DefaultEventCreatesTaskToggle initialValue={defaultEventCreatesTask} />
      <HideNoteOnlyTagsToggle initialValue={hideNoteOnlyTags} />
    </main>
  );
}
