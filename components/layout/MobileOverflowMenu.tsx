"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { LogOut, Menu, Monitor, Moon, Settings, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut } from "@/lib/actions/auth";

const THEME_OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

// The mobile-width counterpart to the header's individually-visible
// ThemeToggle/Settings-link/sign-out actions -- same actions, collapsed
// behind one trigger once the bottom tab bar takes over the header's
// horizontal space. NotificationSetup and GlobalSearch stay put (the
// former is already self-hiding, the latter already collapses to an
// icon at this width).
export function MobileOverflowMenu() {
  const { theme, setTheme } = useTheme();
  const [, startTransition] = useTransition();
  const current = THEME_OPTIONS.find((o) => o.value === theme) ?? THEME_OPTIONS[2];
  const CurrentThemeIcon = current.icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="sm" aria-label="More" />}>
        <Menu className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <CurrentThemeIcon className="size-4" />
            Theme
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {THEME_OPTIONS.map((option) => (
              <DropdownMenuItem key={option.value} onClick={() => setTheme(option.value)}>
                <option.icon className="size-4" />
                {option.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/settings" />}>
          <Settings className="size-4" />
          Settings
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => startTransition(() => signOut())}>
          <LogOut className="size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
