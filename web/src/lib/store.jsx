import { createContext, useContext } from 'react';

export const StoreContext = createContext(null);
export const useStore = () => useContext(StoreContext);

/** Build a storefront path: sp(slug, 'shop') → /s/slug/shop */
export const sp = (slug, path = '') => `/s/${slug}${path ? `/${path.replace(/^\//, '')}` : ''}`;
