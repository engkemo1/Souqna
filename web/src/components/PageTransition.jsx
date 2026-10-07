import { motion } from 'framer-motion';

export default function PageTransition({ children, className }) {
  return (
    <motion.div className={className} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}>
      {children}
    </motion.div>
  );
}
