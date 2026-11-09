import * as React from "react"

/**
 * Below this the app is the phone layout: bottom tabs, sidebar as a sheet, bottom-sheet dialogs. Tablets in portrait
 * and phones in landscape are touch devices without room for a sidebar beside the content, so they get it too.
 * Matches Tailwind's `lg` (the shell switches its classes at `lg:`).
 */
const MOBILE_BREAKPOINT = 1024

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return !!isMobile
}
