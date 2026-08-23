import { getDefaultEventCreatesTask } from "@/lib/actions/settings";
import { DefaultEventCreatesTaskToggle } from "@/components/settings/DefaultEventCreatesTaskToggle";

export default async function SettingsPage() {
  const defaultEventCreatesTask = await getDefaultEventCreatesTask();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-5 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <DefaultEventCreatesTaskToggle initialValue={defaultEventCreatesTask} />
    </main>
  );
}
