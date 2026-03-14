'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase-client'
import { useRouter } from 'next/navigation'

const navItems = [
  {
    href: '/capture',
    label: 'Capture',
    icon: (active: boolean) => (
      <svg className="w-5 h-5" fill={active ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 0 : 1.5} d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    href: '/tasks',
    label: 'Tasks',
    icon: (active: boolean) => (
      <svg className="w-5 h-5" fill={active ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 0 : 1.5} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    href: '/analyst',
    label: 'Analyst',
    icon: (active: boolean) => (
      <svg className="w-5 h-5" fill={active ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 0 : 1.5} d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" />
      </svg>
    ),
  },
]

export default function BottomNav() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/auth')
    router.refresh()
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50">
      <div className="max-w-2xl mx-auto">
        <nav className="bg-white border-t border-ink-100 flex items-center justify-around px-2 py-1 shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
          {navItems.map(item => {
            const active = pathname.startsWith(item.href)
            return (
              <Link key={item.href} href={item.href} className={`nav-link ${active ? 'active' : ''}`}>
                {item.icon(active)}
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            )
          })}
          <button onClick={handleSignOut} className="nav-link">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
            </svg>
            <span className="text-[10px] font-medium">Out</span>
          </button>
        </nav>
      </div>
    </div>
  )
}
