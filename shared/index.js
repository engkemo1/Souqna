export * from './theme.js';

export const ORDER_STATUSES = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
export const ORDER_FLOW = { pending: ['confirmed', 'cancelled'], confirmed: ['processing', 'cancelled'], processing: ['shipped', 'cancelled'], shipped: ['delivered'], delivered: [], cancelled: [] };
export const IMAGE_SIZES = { thumb: 160, sm: 400, md: 800, lg: 1400 };
export const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
export const GOVERNORATES = ['Qalyubia', 'Cairo', 'Giza', 'Alexandria', 'Gharbia', 'Monufia', 'Sharqia', 'Dakahlia'];
