import { Navigate } from 'react-router-dom';

/** There is one basket for the whole of Twist. The old per-store cart address now leads to it. */
export default function CartPage() {
  return <Navigate to="/market-cart" replace />;
}
