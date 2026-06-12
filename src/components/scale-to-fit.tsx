import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"

/**
 * Scales its child to fill the container, growing small content up and shrinking
 * large content down (uniform scale, centered). Used to make playoff brackets
 * of any size fill an arena/TV screen without leaving dead whitespace.
 *
 * Measurement reads the child's natural layout size (`offsetWidth/Height`),
 * which CSS transforms don't affect — so applying the scale never feeds back
 * into the measurement.
 */
export function ScaleToFit({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)

  useEffect(() => {
    const container = containerRef.current
    const content = contentRef.current
    if (!container || !content) return

    const recompute = () => {
      const iw = content.offsetWidth
      const ih = content.offsetHeight
      if (iw === 0 || ih === 0) return
      setScale(Math.min(container.clientWidth / iw, container.clientHeight / ih))
    }
    recompute()

    const observer = new ResizeObserver(recompute)
    observer.observe(container)
    observer.observe(content)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={containerRef}
      className={cn("relative min-h-0 overflow-hidden", className)}
    >
      <div
        ref={contentRef}
        className="absolute top-1/2 left-1/2 w-max"
        style={{ transform: `translate(-50%, -50%) scale(${scale})` }}
      >
        {children}
      </div>
    </div>
  )
}
