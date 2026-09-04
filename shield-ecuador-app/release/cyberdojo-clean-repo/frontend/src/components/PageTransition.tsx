import React from 'react'
import { motion, useReducedMotion, Variants } from 'framer-motion'

const pageVariants: Variants = {
  initial: {
    opacity: 0,
    y: 28,
    scale: 0.985,
    filter: 'blur(10px)',
  },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    filter: 'blur(0px)',
    transition: {
      duration: 0.58,
      ease: [0.16, 1, 0.3, 1],
    },
  },
  exit: {
    opacity: 0,
    y: -18,
    scale: 1.012,
    filter: 'blur(8px)',
    transition: {
      duration: 0.28,
      ease: [0.7, 0, 0.84, 0],
    },
  },
}

export function PageTransition({ children }: { children: React.ReactNode }) {
  const reduceMotion = useReducedMotion()

  if (reduceMotion) {
    return <div className="page-transition">{children}</div>
  }

  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="page-transition premium-scene"
    >
      <div className="scene-sweep" aria-hidden="true" />
      {children}
    </motion.div>
  )
}
