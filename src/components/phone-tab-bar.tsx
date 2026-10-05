import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Calendar, CheckSquare, LayoutDashboard, Menu, Users, type LucideIcon } from 'lucide-react'

import { useSidebar } from '@/components/ui/sidebar'
import { useIsMobile } from '@/hooks/use-mobile'
import { isMobilePlatform } from '@/lib/platform'
import { cn } from '@/lib/utils'

type Tab = {
  id: string
  label: string
  icon: LucideIcon
  /** Where the tab goes the first time it is opened. */
  to: string
  /** Routes that count as this tab (it then remembers the last one for the next tap). */
  match: (pathname: string) => boolean
}

const TABS: Tab[] = [
  { id: 'home', label: 'Home', icon: LayoutDashboard, to: '/', match: (p) => p === '/' },
  { id: 'schedule', label: 'Schedule', icon: Calendar, to: '/schedule/calendar', match: (p) => p.startsWith('/schedule') },
  { id: 'people', label: 'People', icon: Users, to: '/people/cast-manager', match: (p) => p.startsWith('/people') },
  { id: 'tasks', label: 'Tasks', icon: CheckSquare, to: '/tasks', match: (p) => p === '/tasks' },
]

/** Fields that bring up the on-screen keyboard. */
function isTextEntry(el: Element | null): boolean {
  if (!el) return false
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true
  if (el instanceof HTMLInputElement) {
    return !['button', 'checkbox', 'radio', 'range', 'submit', 'reset', 'file', 'color', 'image'].includes(el.type)
  }
  return (el as HTMLElement).isContentEditable === true
}

/**
 * iPhone (portrait) navigation: the four places used most on the go within thumb reach, plus More, which
 * opens the full sidebar. Each tab remembers the last page visited under it, like an iOS tab bar. It hides
 * while the keyboard is up so it doesn't sit on top of the field being typed into.
 */
export function PhoneTabBar() {
  const isPhoneWidth = useIsMobile()
  const show = isPhoneWidth && isMobilePlatform()
  const { pathname, search } = useLocation()
  const navigate = useNavigate()
  const { openMobile, setOpenMobile } = useSidebar()
  const lastRouteByTab = useRef<Record<string, string>>({})
  const [typing, setTyping] = useState(false)

  const activeTab = TABS.find((t) => t.match(pathname))
  useEffect(() => {
    if (activeTab) lastRouteByTab.current[activeTab.id] = pathname + search
  }, [activeTab, pathname, search])

  useEffect(() => {
    if (!show) return
    const update = () => setTyping(isTextEntry(document.activeElement))
    // Focus moves to the next field after focusout, so check once it has settled.
    const onFocusOut = () => setTimeout(update, 0)
    document.addEventListener('focusin', update)
    document.addEventListener('focusout', onFocusOut)
    return () => {
      document.removeEventListener('focusin', update)
      document.removeEventListener('focusout', onFocusOut)
    }
  }, [show])

  // Lets the page column, toasts and fixed controls leave room for the bar.
  const visible = show && !typing
  useEffect(() => {
    const root = document.documentElement
    if (visible) root.dataset.phoneTabBar = ''
    else delete root.dataset.phoneTabBar
    return () => {
      delete root.dataset.phoneTabBar
    }
  }, [visible])

  if (!visible) return null

  const go = (tab: Tab) => {
    setOpenMobile(false)
    // A second tap on the current tab goes back to its first page, as on iOS...
    const target = activeTab?.id === tab.id ? tab.to : lastRouteByTab.current[tab.id] ?? tab.to
    if (target !== pathname + search) navigate(target)
    // ...and on its first page it scrolls back to the top.
    else document.querySelector('[data-slot="sidebar-inset"] > main')?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    // Above the sidebar sheet (z-50) so More can close it again and the tabs stay usable while it is open.
    <nav
      aria-label="Main"
      data-slot="phone-tab-bar"
      className="fixed inset-x-0 bottom-0 z-[60] border-t border-border bg-background/95 pb-[var(--safe-bottom)] backdrop-blur"
    >
      <ul className="flex h-14 items-stretch">
        {TABS.map((tab) => {
          const active = activeTab?.id === tab.id && !openMobile
          const Icon = tab.icon
          return (
            <li key={tab.id} className="flex-1">
              <button
                type="button"
                aria-current={active ? 'page' : undefined}
                onClick={() => go(tab)}
                className={cn(
                  'flex h-full w-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium',
                  active ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                <Icon className="size-5" aria-hidden />
                {tab.label}
              </button>
            </li>
          )
        })}
        <li className="flex-1">
          <button
            type="button"
            aria-expanded={openMobile}
            onClick={() => setOpenMobile(!openMobile)}
            className={cn(
              'flex h-full w-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium',
              openMobile || !activeTab ? 'text-primary' : 'text-muted-foreground'
            )}
          >
            <Menu className="size-5" aria-hidden />
            More
          </button>
        </li>
      </ul>
    </nav>
  )
}
