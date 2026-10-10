import { createContext, useContext } from 'react';

/** Where the product screens live: '/dashboard' for owners, '/admin/manage/<slug>' when the platform admin manages a store. */
export const DashBaseContext = createContext('/dashboard');
export const useDashBase = () => useContext(DashBaseContext);
