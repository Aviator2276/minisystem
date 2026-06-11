import { useMemo } from "react"
import { motion } from "motion/react"

interface Particle {
  left: number
  size: number
  color: string
  delay: number
  duration: number
  drift: number
  spin: number
}

/**
 * One celebratory burst of falling confetti. Pure Motion — no canvas, no
 * extra deps. Mount it once (e.g. keyed to a match id) and let it rain.
 */
export function Confetti({
  color,
  count = 90,
}: {
  /** primary color; mixed with white + gold for variety */
  color: string
  count?: number
}) {
  const particles = useMemo<Particle[]>(() => {
    const palette = [color, color, "#ffffff", "#facc15"]
    return Array.from({ length: count }, (_, i) => ({
      left: Math.random() * 100,
      size: 6 + Math.random() * 8,
      color: palette[i % palette.length],
      delay: Math.random() * 1.2,
      duration: 2.6 + Math.random() * 2.2,
      drift: (Math.random() - 0.5) * 220,
      spin: (Math.random() - 0.5) * 1080,
    }))
  }, [color, count])

  return (
    <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
      {particles.map((p, i) => (
        <motion.div
          key={i}
          className="absolute top-0"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 1.6,
            backgroundColor: p.color,
          }}
          initial={{ y: "-10vh", opacity: 1, rotate: 0 }}
          animate={{
            y: "115vh",
            x: p.drift,
            rotate: p.spin,
            opacity: [1, 1, 0.9, 0],
          }}
          transition={{ duration: p.duration, delay: p.delay, ease: "easeIn" }}
        />
      ))}
    </div>
  )
}
