import { getDefaultEventCreatesTask, getHideNoteOnlyTags } from "@/lib/actions/settings";
import { getGoogleCalendarConnection } from "@/lib/actions/calendarConnections";
import { DefaultEventCreatesTaskToggle } from "@/components/settings/DefaultEventCreatesTaskToggle";
import { HideNoteOnlyTagsToggle } from "@/components/settings/HideNoteOnlyTagsToggle";
import { GoogleCalendarConnection } from "@/components/settings/GoogleCalendarConnection";

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const params = await searchParams;
  const [defaultEventCreatesTask, hideNoteOnlyTags, googleCalendarConnection] = await Promise.all([
    getDefaultEventCreatesTask(),
    getHideNoteOnlyTags(),
    getGoogleCalendarConnection(),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-5 p-6">
      <h1 className="font-heading text-2xl tracking-tight">Settings</h1>
      <DefaultEventCreatesTaskToggle initialValue={defaultEventCreatesTask} />
      <HideNoteOnlyTagsToggle initialValue={hideNoteOnlyTags} />
      <GoogleCalendarConnection
        connection={googleCalendarConnection}
        connectError={typeof params.calendar_error === "string" ? params.calendar_error : undefined}
      />
    </main>
  );
}
