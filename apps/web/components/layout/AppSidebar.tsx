'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createBrowserSupabaseClient } from '@/lib/supabase';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: '⚡' },
  { href: '/settings', label: 'Settings', icon: '⚙️' },
  { href: '/resume', label: 'Resume', icon: '📄' },
  { href: '/logs', label: 'Logs', icon: '📋' },
  { href: '/guide', label: 'Guide', icon: '📖' },
];

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    async function getUser() {
      try {
        const supabase = createBrowserSupabaseClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user?.email) {
          setUserEmail(user.email);
        }
      } catch {
        // ignore
      }
    }
    getUser();
  }, []);

  async function handleLogout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
      router.refresh();
    } catch {
      router.push('/login');
    }
  }

  return (
    <aside className="flex w-56 flex-shrink-0 flex-col border-r border-slate-800 bg-slate-900">
      <div className="border-b border-slate-800 p-4">
        <h1 className="text-lg font-bold text-white">Naukri Update</h1>
        <p className="mt-0.5 text-xs text-slate-400">Automation Control Plane</p>
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
                  ? 'bg-slate-800 text-white font-medium'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <span aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-slate-800 p-3 space-y-2">
        {userEmail && (
          <div className="px-2 py-1 text-xs text-slate-400 truncate" title={userEmail}>
            <span className="block text-[10px] text-slate-500 uppercase">Signed in as</span>
            {userEmail}
          </div>
        )}
        <button
          onClick={handleLogout}
          className="w-full text-left text-xs text-slate-400 hover:text-red-400 px-2 py-1.5 rounded hover:bg-slate-800 transition"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
