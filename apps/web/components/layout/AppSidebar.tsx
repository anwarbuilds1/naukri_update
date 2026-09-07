'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: '⚡' },
  { href: '/settings', label: 'Settings', icon: '⚙️' },
  { href: '/resume', label: 'Resume', icon: '📄' },
  { href: '/logs', label: 'Logs', icon: '📋' },
  { href: '/guide', label: 'Guide', icon: '📖' },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-56 flex-shrink-0 flex-col border-r border-slate-800 bg-slate-900">
      <div className="border-b border-slate-800 p-4">
        <h1 className="text-lg font-bold">Naukri Update</h1>
        <p className="mt-0.5 text-xs text-slate-400">Automation Agent</p>
      </div>
      <nav className="flex-1 space-y-1 p-2">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                isActive
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <span aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-slate-800 p-4 text-xs text-slate-500">
        Phase 1 Foundation
      </div>
    </aside>
  );
}
