import { useEffect, useRef } from "react"
import { animate, motion, useMotionValue, useTransform } from "motion/react"

/** counts toward `value` with a quick pop on change */
export function AnimatedNumber({
  value,
  className,
  style,
}: {
  value: number
  className?: string
  style?: React.CSSProperties
}) {
  const motionValue = useMotionValue(value)
  const rounded = useTransform(motionValue, (v) => Math.round(v))
  const scale = useMotionValue(1)
  const previous = useRef(value)

  useEffect(() => {
    if (previous.current === value) return
    previous.current = value
    const count = animate(motionValue, value, {
      duration: 0.5,
      ease: "easeOut",
    })
    const pop = animate(scale, [1, 1.25, 1], {
      duration: 0.45,
      ease: "easeOut",
    })
    return () => {
      count.stop()
      pop.stop()
    }
  }, [value, motionValue, scale])

  return (
    <motion.span
      className={className}
      style={{ ...style, scale, display: "inline-block" }}
    >
      <motion.span>{rounded}</motion.span>
    </motion.span>
  )
}
