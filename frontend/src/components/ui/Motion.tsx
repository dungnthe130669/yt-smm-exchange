import { motion, useMotionValue, useTransform, animate } from 'motion/react'
import { useEffect } from 'react'

// Animate a number counting up from 0 to value
export function CountUp({ value, className }: { value: number; className?: string }) {
  const count = useMotionValue(0)
  const rounded = useTransform(count, (v) => Math.round(v).toLocaleString('en-US'))

  useEffect(() => {
    const ctrl = animate(count, value, { duration: 0.8, ease: 'easeOut' })
    return ctrl.stop
  }, [value, count])

  return <motion.span className={className}>{rounded}</motion.span>
}

// Fade + slide up entrance
export function FadeUp({
  children,
  delay = 0,
  className,
  style,
}: {
  children: React.ReactNode
  delay?: number
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay, ease: 'easeOut' }}
      className={className}
      style={style}
    >
      {children}
    </motion.div>
  )
}

// Stagger children
export function StaggerList({
  children,
  className,
  style,
}: {
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: 0.05 } },
      }}
      className={className}
      style={style}
    >
      {children}
    </motion.div>
  )
}

// Stagger item — use inside StaggerList
export function StaggerItem({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 10 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.18, ease: 'easeOut' } },
      }}
      className={className}
    >
      {children}
    </motion.div>
  )
}
