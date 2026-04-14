import type { ReactNode } from 'react';
import { Link, useMatchRoute } from '@tanstack/react-router';

import { useTheme } from '@/components/shared/ThemeProvider';
import { RuntimeControls } from '@/components/layout/RuntimeControls';
import { Button } from '@/components/ui/button';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarGroup,
  SidebarGroupContent,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { UpdateBanner } from '@/components/layout/UpdateBanner';
import {
  ActivityIcon,
  ClockIcon,
  SettingsIcon,
  SunIcon,
  MoonIcon,
  MonitorIcon,
  FolderSyncIcon,
} from 'lucide-react';

interface Props {
  children: ReactNode;
}

const NAV_ITEMS = [
  { to: '/board' as const, label: 'Live', icon: ActivityIcon },
  { to: '/history' as const, label: 'History', icon: ClockIcon },
  { to: '/projects' as const, label: 'Projects', icon: FolderSyncIcon },
  { to: '/system' as const, label: 'System', icon: SettingsIcon },
];

function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  const cycle = () => {
    if (theme === 'light') setTheme('dark');
    else if (theme === 'dark') setTheme('system');
    else setTheme('light');
  };

  const Icon =
    theme === 'dark' ? MoonIcon : theme === 'light' ? SunIcon : MonitorIcon;

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={cycle}
      className="h-7 w-7 text-muted-foreground/50 hover:text-foreground"
    >
      <Icon className="h-3.5 w-3.5" />
    </Button>
  );
}

export function Shell({ children }: Props) {
  return (
    <>
      <UpdateBanner />
      <SidebarProvider>
      <Sidebar className="border-r-0">
        {/* ── Header: Logo ────────────────────────── */}
        <SidebarHeader className="pb-0 pt-2 px-3">
          <div className="flex items-center gap-2 py-1">
            <div className="flex aspect-square size-8 items-center justify-center overflow-hidden rounded-lg">
              <img src="/logo-dark.png" alt="Reeve" className="hidden size-8 dark:block" />
              <img src="/logo-light.png" alt="Reeve" className="block size-8 dark:hidden" />
            </div>
            <span className="text-sm font-semibold tracking-tight">Reeve</span>
          </div>
        </SidebarHeader>

        {/* ── Navigation ──────────────────────────── */}
        <SidebarContent className="pt-2">
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {NAV_ITEMS.map((item) => (
                  <NavItem key={item.to} item={item} />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        {/* ── Footer: preferences + theme ──── */}
        <SidebarFooter className="border-t-0">
          <div className="flex items-center justify-end px-3 py-1">
            <ThemeToggle />
          </div>
        </SidebarFooter>
      </Sidebar>

      {/* ── Main content ────────────────────────── */}
      <SidebarInset>
        {/* Page header */}
        <header className="flex h-12 shrink-0 items-center justify-between border-b px-4">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="md:hidden" />
            <PageTitle />
          </div>
          <RuntimeControls />
        </header>

        <main className="flex-1 min-h-0 overflow-hidden">{children}</main>
      </SidebarInset>
    </SidebarProvider>
    </>
  );
}

/** Single nav item — owns its own active state via router matching. */
function NavItem({ item }: { item: typeof NAV_ITEMS[number] }) {
  const Icon = item.icon;
  const matchRoute = useMatchRoute();
  const isActive = !!matchRoute({ to: item.to, fuzzy: true });

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        render={<Link to={item.to} />}
        isActive={isActive}
        tooltip={item.label}
      >
        <Icon />
        <span>{item.label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

/** Page title derived from router match, not pathname parsing. */
function PageTitle() {
  const matchRoute = useMatchRoute();
  const active = NAV_ITEMS.find((item) => matchRoute({ to: item.to, fuzzy: true }));
  return (
    <span className="text-sm font-medium capitalize text-foreground/80">
      {active?.label ?? 'Live'}
    </span>
  );
}

