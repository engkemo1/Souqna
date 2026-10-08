import { lazy, Suspense } from 'react';
import { createBrowserRouter, RouterProvider, Outlet, ScrollRestoration, Navigate } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import { I18nProvider } from './lib/i18n.jsx';
import { AuthProvider } from './lib/auth.jsx';
import { CartProvider } from './lib/cart.jsx';
import { ToastProvider } from './components/ui/Toast.jsx';
import RouteFallback from './components/RouteFallback.jsx';
import NotFound from './pages/NotFound.jsx';

const MarketHome = lazy(() => import('./pages/market/MarketHome.jsx'));
const Login = lazy(() => import('./pages/auth/Login.jsx'));
const Register = lazy(() => import('./pages/auth/Register.jsx'));
const Setup = lazy(() => import('./pages/auth/Setup.jsx'));
const Join = lazy(() => import('./pages/market/Join.jsx'));

const StoreLayout = lazy(() => import('./pages/store/StoreLayout.jsx'));
const StoreHome = lazy(() => import('./pages/store/StoreHome.jsx'));
const Shop = lazy(() => import('./pages/store/Shop.jsx'));
const Product = lazy(() => import('./pages/store/Product.jsx'));
const Categories = lazy(() => import('./pages/store/Categories.jsx'));
const Search = lazy(() => import('./pages/store/Search.jsx'));
const Favorites = lazy(() => import('./pages/store/Favorites.jsx'));
const CartPage = lazy(() => import('./pages/store/CartPage.jsx'));
const Checkout = lazy(() => import('./pages/store/Checkout.jsx'));
const OrderSuccess = lazy(() => import('./pages/store/OrderSuccess.jsx'));

const DashboardLayout = lazy(() => import('./pages/dashboard/DashboardLayout.jsx'));
const Overview = lazy(() => import('./pages/dashboard/Overview.jsx'));
const Orders = lazy(() => import('./pages/dashboard/Orders.jsx'));
const OrderDetail = lazy(() => import('./pages/dashboard/OrderDetail.jsx'));
const Products = lazy(() => import('./pages/dashboard/Products.jsx'));
const ProductEditor = lazy(() => import('./pages/dashboard/ProductEditor.jsx'));
const Offers = lazy(() => import('./pages/dashboard/Offers.jsx'));
const Banners = lazy(() => import('./pages/dashboard/Banners.jsx'));
const DashCategories = lazy(() => import('./pages/dashboard/Categories.jsx'));
const Customers = lazy(() => import('./pages/dashboard/Customers.jsx'));
const Analytics = lazy(() => import('./pages/dashboard/Analytics.jsx'));
const Settings = lazy(() => import('./pages/dashboard/Settings.jsx'));
const ThemeEditor = lazy(() => import('./pages/dashboard/ThemeEditor.jsx'));
const More = lazy(() => import('./pages/dashboard/More.jsx'));

function Root() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Outlet />
      <ScrollRestoration getKey={(loc) => loc.pathname} />
    </Suspense>
  );
}

const router = createBrowserRouter([
  {
    element: <Root />,
    errorElement: <NotFound crashed />,
    children: [
      { path: '/', element: <MarketHome /> },
      { path: '/login', element: <Login /> },
      { path: '/register', element: <Register /> },
      { path: '/setup/:token', element: <Setup /> },
      { path: '/join', element: <Join /> },
      {
        path: '/s/:slug',
        element: <StoreLayout />,
        children: [
          { index: true, element: <StoreHome /> },
          { path: 'shop', element: <Shop /> },
          { path: 'p/:pslug', element: <Product /> },
          { path: 'categories', element: <Categories /> },
          { path: 'search', element: <Search /> },
          { path: 'favorites', element: <Favorites /> },
          { path: 'cart', element: <CartPage /> },
          { path: 'checkout', element: <Checkout /> },
          { path: 'order/:number', element: <OrderSuccess /> },
          { path: '*', element: <NotFound inStore /> },
        ],
      },
      {
        path: '/dashboard',
        element: <DashboardLayout />,
        children: [
          { index: true, element: <Overview /> },
          { path: 'orders', element: <Orders /> },
          { path: 'orders/:id', element: <OrderDetail /> },
          { path: 'products', element: <Products /> },
          { path: 'products/new', element: <ProductEditor /> },
          { path: 'products/:id', element: <ProductEditor /> },
          { path: 'offers', element: <Offers /> },
          { path: 'banners', element: <Banners /> },
          { path: 'categories', element: <DashCategories /> },
          { path: 'customers', element: <Customers /> },
          { path: 'analytics', element: <Analytics /> },
          { path: 'settings', element: <Settings /> },
          { path: 'theme', element: <ThemeEditor /> },
          { path: 'more', element: <More /> },
          { path: '*', element: <Navigate to="/dashboard" replace /> },
        ],
      },
      { path: '*', element: <NotFound /> },
    ],
  },
]);

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <I18nProvider>
        <AuthProvider>
          <CartProvider>
            <ToastProvider>
              <RouterProvider router={router} />
            </ToastProvider>
          </CartProvider>
        </AuthProvider>
      </I18nProvider>
    </MotionConfig>
  );
}
