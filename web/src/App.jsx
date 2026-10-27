import { lazy, Suspense } from 'react';
import { createBrowserRouter, RouterProvider, Outlet, ScrollRestoration, Navigate } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import { I18nProvider } from './lib/i18n.jsx';
import { AuthProvider } from './lib/auth.jsx';
import { CartProvider } from './lib/cart.jsx';
import { ToastProvider } from './components/ui/Toast.jsx';
import { BuyerProvider } from './lib/buyer.jsx';
import RouteFallback from './components/RouteFallback.jsx';
import NotFound from './pages/NotFound.jsx';

const MarketHome = lazy(() => import('./pages/market/MarketHome.jsx'));
const StoresDirectory = lazy(() => import('./pages/market/StoresDirectory.jsx'));
const MarketSearch = lazy(() => import('./pages/market/MarketSearch.jsx'));
const MarketCart = lazy(() => import('./pages/market/MarketCart.jsx'));
const MarketFavorites = lazy(() => import('./pages/market/MarketFavorites.jsx'));
const MarketCheckout = lazy(() => import('./pages/market/MarketCheckout.jsx'));
const MarketOrderSuccess = lazy(() => import('./pages/market/MarketOrderSuccess.jsx'));
const VisualSearch = lazy(() => import('./pages/market/VisualSearch.jsx'));
const Login = lazy(() => import('./pages/auth/Login.jsx'));
const Register = lazy(() => import('./pages/auth/Register.jsx'));
const Setup = lazy(() => import('./pages/auth/Setup.jsx'));
const Track = lazy(() => import('./pages/market/Track.jsx'));
const Join = lazy(() => import('./pages/market/Join.jsx'));
const Account = lazy(() => import('./pages/market/Account.jsx'));
const LookShare = lazy(() => import('./pages/market/LookShare.jsx'));
const LookOfDayDetail = lazy(() => import('./pages/market/LookOfDayDetail.jsx'));
const Legal = lazy(() => import('./pages/market/Legal.jsx'));
const Request = lazy(() => import('./pages/market/Request.jsx'));
const BanhaRunner = lazy(() => import('./pages/market/BanhaRunner.jsx'));
const Pos = lazy(() => import('./pages/pos/Pos.jsx'));

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
const BiometricGate = lazy(() => import('./components/auth/BiometricGate.jsx'));
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
const Services = lazy(() => import('./pages/dashboard/Services.jsx'));
const Reviews = lazy(() => import('./pages/dashboard/Reviews.jsx'));
const ThemeEditor = lazy(() => import('./pages/dashboard/ThemeEditor.jsx'));
const StoreDesigner = lazy(() => import('./pages/dashboard/StoreDesigner.jsx'));
const AdminApp = lazy(() => import('./pages/admin/AdminApp.jsx'));
const AdminOverview = lazy(() => import('./pages/admin/Overview.jsx'));
const AdminStores = lazy(() => import('./pages/admin/Stores.jsx'));
const AdminDepartments = lazy(() => import('./pages/admin/Departments.jsx'));
const AdminOrders = lazy(() => import('./pages/admin/Orders.jsx'));
const AdminDeliveries = lazy(() => import('./pages/admin/Deliveries.jsx'));
const AdminDeliveryPeople = lazy(() => import('./pages/admin/DeliveryPeople.jsx'));
const AdminDeliveryRates = lazy(() => import('./pages/admin/DeliveryRates.jsx'));
const AdminDeliveryZones = lazy(() => import('./pages/admin/DeliveryZones.jsx'));
const AdminSubscriptions = lazy(() => import('./pages/admin/Subscriptions.jsx'));
const AdminServices = lazy(() => import('./pages/admin/Services.jsx'));
const AdminSourcing = lazy(() => import('./pages/admin/Sourcing.jsx'));
const AdminBuyers = lazy(() => import('./pages/admin/Buyers.jsx'));
const AdminPhotos = lazy(() => import('./pages/admin/Photos.jsx'));
const AdminReports = lazy(() => import('./pages/admin/Reports.jsx'));
const AdminCoupons = lazy(() => import('./pages/admin/Coupons.jsx'));
const AdminHomepageAds = lazy(() => import('./pages/admin/HomepageAds.jsx'));
const StoreManage = lazy(() => import('./pages/admin/StoreManage.jsx'));
const AdminSystem = lazy(() => import('./pages/admin/System.jsx'));
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
      { path: '/stores', element: <StoresDirectory /> },
      { path: '/search', element: <MarketSearch /> },
      { path: '/market-cart', element: <MarketCart /> },
      { path: '/market-checkout', element: <MarketCheckout /> },
      { path: '/market-order-success', element: <MarketOrderSuccess /> },
      { path: '/favorites', element: <MarketFavorites /> },
      { path: '/visual', element: <VisualSearch /> },
      { path: '/login', element: <Login /> },
      { path: '/register', element: <Register /> },
      { path: '/setup/:token', element: <Setup /> },
      { path: '/track', element: <Track /> },
      { path: '/track/:token', element: <Track /> },
      { path: '/join', element: <Join /> },
      { path: '/account', element: <Account /> },
      { path: '/look/:token', element: <LookShare /> },
      { path: '/look-of-day/:index', element: <LookOfDayDetail /> },
      { path: '/legal', element: <Legal /> },
      { path: '/legal/:doc', element: <Legal /> },
      { path: '/request', element: <Request /> },
      { path: '/request/:token', element: <Request /> },
      { path: '/play/banha', element: <BanhaRunner /> },
      { path: '/pos', element: <Pos /> },
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
        element: <BiometricGate><DashboardLayout /></BiometricGate>,
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
          { path: 'services', element: <Services /> },
          { path: 'reviews', element: <Reviews /> },
          { path: 'theme', element: <ThemeEditor /> },
          { path: 'design', element: <StoreDesigner /> },
          { path: 'more', element: <More /> },
          { path: '*', element: <Navigate to="/dashboard" replace /> },
        ],
      },
      {
        path: '/admin',
        element: <AdminApp />,
        children: [
          { index: true, element: <AdminOverview /> },
          { path: 'stores', element: <AdminStores /> },
          { path: 'departments', element: <AdminDepartments /> },
          { path: 'orders', element: <AdminOrders /> },
          { path: 'deliveries', element: <AdminDeliveries /> },
          { path: 'delivery-people', element: <AdminDeliveryPeople /> },
          { path: 'delivery-rates', element: <AdminDeliveryRates /> },
          { path: 'delivery-zones', element: <AdminDeliveryZones /> },
          { path: 'subscriptions', element: <AdminSubscriptions /> },
          { path: 'services', element: <AdminServices /> },
          { path: 'sourcing', element: <AdminSourcing /> },
          { path: 'buyers', element: <AdminBuyers /> },
          { path: 'photos', element: <AdminPhotos /> },
          { path: 'coupons', element: <AdminCoupons /> },
          { path: 'ads', element: <AdminHomepageAds /> },
          { path: 'reports', element: <AdminReports /> },
          { path: 'system', element: <AdminSystem /> },
          {
            path: 'manage/:slug',
            element: <StoreManage />,
            children: [
              { path: 'products', element: <Products /> },
              { path: 'products/new', element: <ProductEditor /> },
              { path: 'products/:id', element: <ProductEditor /> },
              { path: '*', element: <Navigate to="products" replace /> },
            ],
          },
          { path: '*', element: <Navigate to="/admin" replace /> },
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
          <BuyerProvider>
          <CartProvider>
            <ToastProvider>
              <RouterProvider router={router} />
            </ToastProvider>
          </CartProvider>
          </BuyerProvider>
        </AuthProvider>
      </I18nProvider>
    </MotionConfig>
  );
}
